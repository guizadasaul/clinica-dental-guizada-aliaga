/**
 * Backfill de CLI-257: las reservas web ya pagadas suman su consulta al
 * presupuesto del paciente, con el pago aplicado a esa línea, igual que hace
 * desde ahora la confirmación del pago (attachWebConsultation). Después
 * marca como realizadas las que ya pasaron o están atendidas
 * (syncWebConsultations), así aparecen en el historial.
 *
 * - Solo reservas web con pago (paid_at), paciente vinculado y sin línea
 *   todavía: es idempotente.
 * - Cada reserva va en su propia transacción. La consulta es el tratamiento
 *   de la reserva o, si no tiene, la consulta por defecto del catálogo.
 * - Las pagadas sin paciente vinculado no se tocan: quedan en el reporte.
 *
 * Sin --apply es un dry-run: hace lo mismo dentro de una transacción y la
 * revierte, así el reporte es exactamente lo que pasaría.
 *
 *   npx ts-node prisma/backfill-web-consultations.ts           # dry-run
 *   npx ts-node prisma/backfill-web-consultations.ts --apply   # aplica
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { pgConnectionConfig } from '../src/shared/prisma/pg-connection';
import {
  attachWebConsultation,
  syncWebConsultations,
  type WebConsultationSync,
} from '../src/payments/infrastructure/persistence/web-consultation-writes';

const APPLY = process.argv.includes('--apply');

const adapter = new PrismaPg(pgConnectionConfig());
const prisma = new PrismaClient({ adapter });

/** Sale de la transacción para revertirla en el dry-run, con el resultado. */
class DryRunRollback<T> extends Error {
  constructor(readonly result: T) {
    super('dry-run');
  }
}

async function inTransaction<T>(
  work: (
    tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  ) => Promise<T>,
): Promise<T> {
  try {
    return await prisma.$transaction(
      async (tx) => {
        const result = await work(tx);
        if (!APPLY) {
          throw new DryRunRollback(result);
        }
        return result;
      },
      { timeout: 60_000 },
    );
  } catch (error: unknown) {
    if (error instanceof DryRunRollback) {
      return error.result as T;
    }
    throw error;
  }
}

async function main(): Promise<void> {
  const where = {
    source: 'public_web',
    paid_at: { not: null },
    payment_amount: { not: null },
    quote_item_id: null,
  } as const;
  const [pending, withoutPatient, consultation] = await Promise.all([
    prisma.appointments.findMany({
      where: { ...where, patient_id: { not: null } },
      select: {
        id: true,
        status: true,
        patient_id: true,
        treatment_id: true,
        payment_amount: true,
        paid_at: true,
        appointment_datetime: true,
        patients: { select: { first_name: true, last_name_paternal: true } },
      },
      orderBy: { paid_at: 'asc' },
    }),
    prisma.appointments.count({ where: { ...where, patient_id: null } }),
    prisma.treatments.findFirst({
      where: { is_default_consultation: true },
      select: { id: true, name: true },
    }),
  ]);

  console.log(
    `${APPLY ? 'APLICANDO' : 'DRY-RUN (no escribe nada)'}: ${pending.length} reservas web pagadas sin línea en el presupuesto; ${withoutPatient} pagadas sin paciente vinculado (no se tocan).`,
  );

  let added = 0;
  let addedBob = 0;
  const skipped: string[] = [];
  for (const appt of pending) {
    const name = `${appt.patients!.first_name} ${appt.patients!.last_name_paternal}`;
    const amount = Number(appt.payment_amount);
    const treatmentId = appt.treatment_id ?? consultation?.id;
    const when = appt.appointment_datetime.toISOString().slice(0, 16);
    if (!treatmentId) {
      skipped.push(
        `${name} (${when}): no hay consulta por defecto en el catálogo`,
      );
      continue;
    }
    await inTransaction((tx) =>
      attachWebConsultation(tx, {
        appointmentId: appt.id,
        patientId: appt.patient_id!,
        treatmentId,
        amount,
        paidAt: appt.paid_at!,
      }),
    );
    added += 1;
    addedBob += amount;
    console.log(
      `- ${name}: cita ${when} (${appt.status}), Bs ${amount.toFixed(2)} pagados`,
    );
  }

  // En el dry-run las líneas de arriba ya se revirtieron: el barrido solo
  // cuenta lo que existía antes.
  const sync = await inTransaction<WebConsultationSync>((tx) =>
    syncWebConsultations(tx, new Date()),
  );

  for (const s of skipped) {
    console.log(`  sin sumar: ${s}`);
  }
  console.log(
    `TOTAL: ${added} consultas sumadas (Bs ${addedBob.toFixed(2)}, ya pagadas: la deuda no cambia); ${sync.performed} marcadas realizadas, ${sync.undone} desmarcadas; ${skipped.length} sin sumar.`,
  );
  if (!APPLY) {
    console.log(
      'Dry-run: no se guardó nada (las realizadas se cuentan al aplicar). Para aplicar: --apply',
    );
  }
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
