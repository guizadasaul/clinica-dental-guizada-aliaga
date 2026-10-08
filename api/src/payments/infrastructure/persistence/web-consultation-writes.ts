import type { Prisma } from '@prisma/client';
import {
  insertQuoteItems,
  recalculateQuote,
} from '../../../quotes/infrastructure/persistence/quote-writes';
import { PaymentMethod } from '../../../quotes/domain/PaymentMethod';

// La consulta reservada y pagada por la web en el presupuesto del paciente
// (CLI-257). Corre dentro de una transacción ajena: la usan la confirmación
// del pago (PrismaBookingConfirmationRepository), el reconciliador y el
// backfill (prisma/backfill-web-consultations.ts, con ts-node: por eso estos
// imports van sin sufijo .js, igual que quote-writes).

export const WEB_CONSULTATION_NOTE = 'Pago de la reserva web';
export const WEB_CONSULTATION_PROCEDURE_NOTE = 'Consulta reservada por la web';

export interface WebConsultationData {
  appointmentId: string;
  patientId: string;
  treatmentId: string;
  amount: number;
  paidAt: Date;
}

export interface AttachedWebConsultation {
  quoteId: string;
  quoteItemId: string;
}

/**
 * Suma la consulta al presupuesto abierto del paciente (el más nuevo pendiente
 * o con pago parcial, la misma regla que registrar un tratamiento fuera del
 * plan, CLI-226) o a uno nuevo; lo deja compartido para que el paciente lo
 * vea, registra el pago aplicado a esa línea y liga la cita con la línea.
 */
export async function attachWebConsultation(
  tx: Prisma.TransactionClient,
  data: WebConsultationData,
): Promise<AttachedWebConsultation> {
  const open = await tx.quotes.findFirst({
    where: {
      patient_id: data.patientId,
      status: { in: ['pending', 'partially_paid'] },
    },
    orderBy: { created_at: 'desc' },
    select: { id: true },
  });
  let quoteId: string;
  if (open) {
    quoteId = open.id;
    await tx.quotes.updateMany({
      where: { id: quoteId, shared_at: null },
      data: { shared_at: new Date() },
    });
  } else {
    quoteId = (
      await tx.quotes.create({
        data: { patient_id: data.patientId, shared_at: new Date() },
        select: { id: true },
      })
    ).id;
  }

  const [item] = await insertQuoteItems(tx, quoteId, [
    {
      treatmentId: data.treatmentId,
      toothNumber: null,
      unitPrice: data.amount,
      quantity: 1,
      subtotal: data.amount,
      currency: 'BOB',
      exchangeRate: null,
    },
  ]);

  await tx.payments.create({
    data: {
      quote_id: quoteId,
      amount: data.amount,
      payment_method: PaymentMethod.QR_BANECO,
      payment_date: data.paidAt,
      notes: WEB_CONSULTATION_NOTE,
      quote_item_id: item.id,
    },
  });
  const paid = await tx.payments.aggregate({
    where: { quote_id: quoteId },
    _sum: { amount: true },
  });
  await tx.quotes.update({
    where: { id: quoteId },
    data: { total_paid: Number(paid._sum.amount ?? 0) },
  });
  // Recalcula el total con la línea nueva y, con lo pagado ya al día, el estado.
  await recalculateQuote(tx, quoteId);

  await tx.appointments.update({
    where: { id: data.appointmentId },
    data: { quote_item_id: item.id },
  });
  return { quoteId, quoteItemId: item.id };
}

/** Fecha de la cita en La Paz, para tooth_procedures.procedure_date (@db.Date). */
function laPazDate(datetime: Date): Date {
  const ymd = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/La_Paz',
  }).format(datetime);
  return new Date(`${ymd}T00:00:00.000Z`);
}

export interface WebConsultationSync {
  performed: number;
  undone: number;
}

/**
 * Deja al día cuáles consultas web cuentan como realizadas: las atendidas y
 * las confirmadas que ya pasaron pasan a tener su procedimiento (aparecen en el
 * historial y la línea del presupuesto dice "Realizado"); las marcadas como
 * "No asistió" lo pierden. Idempotente: tooth_procedures.quote_item_id es
 * UNIQUE y solo se crean los que faltan.
 */
export async function syncWebConsultations(
  tx: Prisma.TransactionClient,
  now: Date,
): Promise<WebConsultationSync> {
  const due = await tx.appointments.findMany({
    where: {
      quote_item_id: { not: null },
      // "Atendida" (CLI-208) cuenta aunque el doctor la marque antes de la hora.
      OR: [
        { status: 'attended' },
        { status: 'confirmed', appointment_datetime: { lte: now } },
      ],
      patient_id: { not: null },
      quote_item: { is: { tooth_procedures: { none: {} } } },
    },
    select: {
      appointment_datetime: true,
      doctor_id: true,
      patient_id: true,
      quote_item: { select: { id: true, treatment_id: true, subtotal: true } },
    },
  });
  for (const appt of due) {
    const item = appt.quote_item!;
    await tx.tooth_procedures.create({
      data: {
        patient_id: appt.patient_id!,
        treatment_id: item.treatment_id,
        tooth_number: null,
        price_charged: item.subtotal,
        quantity: 1,
        quote_item_id: item.id,
        procedure_date: laPazDate(appt.appointment_datetime),
        notes: WEB_CONSULTATION_PROCEDURE_NOTE,
        performed_by: appt.doctor_id,
      },
    });
  }

  const undone = await tx.tooth_procedures.deleteMany({
    where: {
      quote_items: {
        is: { appointment: { is: { status: 'no_show' } } },
      },
    },
  });
  return { performed: due.length, undone: undone.count };
}
