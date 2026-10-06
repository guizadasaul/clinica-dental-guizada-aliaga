import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service.js';
import type {
  IQuoteRepository,
  NewQuoteItemData,
  NewQuoteItemGroupData,
  NewPaymentData,
  NewQrChargeData,
} from '../../domain/QuoteRepository.js';
import type { QrCharge } from '../../domain/QrCharge.js';
import { QrChargeStatus } from '../../domain/QrCharge.js';
import { PaymentMethod } from '../../domain/PaymentMethod.js';
import type { Quote } from '../../domain/Quote.js';
import { deriveQuoteStatus } from '../../domain/QuoteStatus.js';
import { QuoteMapper } from './quote.mapper.js';

export const QUOTE_INCLUDE = {
  quote_items: {
    include: {
      application_groups: true,
      treatments: { select: { name: true } },
      // CLI-226: el procedimiento registrado que cumplió la fila.
      tooth_procedures: { select: { id: true, procedure_date: true } },
    },
  },
  // CLI-218: el QR que originó cada pago, con los tratamientos que eligió el paciente.
  payments: { include: { qr_charge: { include: { lines: true } } } },
} as const;

/** Una fila recién creada del presupuesto: con qué se vincula el procedimiento (CLI-226). */
export interface InsertedQuoteItem {
  id: string;
  toothNumber: number | null;
}

/** Filas sueltas (cada una con su precio), dentro de una transacción. */
export async function insertQuoteItems(
  tx: Prisma.TransactionClient,
  quoteId: string,
  items: NewQuoteItemData[],
): Promise<InsertedQuoteItem[]> {
  const created = await tx.quote_items.createManyAndReturn({
    data: items.map((item) => ({
      quote_id: quoteId,
      treatment_id: item.treatmentId,
      tooth_number: item.toothNumber,
      unit_price: item.unitPrice,
      quantity: item.quantity,
      subtotal: item.subtotal,
      currency: item.currency,
      exchange_rate: item.exchangeRate ?? null,
    })),
    select: { id: true, tooth_number: true },
  });
  return created.map((c) => ({ id: c.id, toothNumber: c.tooth_number }));
}

// CLI-45: el precio del grupo vive una sola vez en application_groups —
// las N filas de quote_items (una por diente) no tienen precio propio, a
// diferencia del viejo esquema donde una fila arbitraria lo tenía y el
// resto facturaba 0.
export async function insertQuoteItemGroup(
  tx: Prisma.TransactionClient,
  quoteId: string,
  data: NewQuoteItemGroupData,
): Promise<InsertedQuoteItem[]> {
  const group = await tx.application_groups.create({
    data: {
      quote_id: quoteId,
      treatment_id: data.treatmentId,
      unit_price: data.unitPrice,
      subtotal: data.subtotal,
      currency: data.currency,
      exchange_rate: data.exchangeRate ?? null,
    },
  });
  const created = await tx.quote_items.createManyAndReturn({
    data: data.toothNumbers.map((toothNumber) => ({
      quote_id: quoteId,
      treatment_id: data.treatmentId,
      tooth_number: toothNumber,
      application_group_id: group.id,
    })),
    select: { id: true, tooth_number: true },
  });
  return created.map((c) => ({ id: c.id, toothNumber: c.tooth_number }));
}

/**
 * Recalcula total_amount y status después de agregar, quitar o cambiar
 * líneas. total_amount suma dos fuentes que nunca se solapan: subtotal de
 * las filas sueltas (application_group_id NULL) + subtotal de cada grupo
 * (una vez por grupo, sin importar cuántos dientes tenga) — CLI-45. El
 * status se recalcula también (CLI-226): una línea nueva en un presupuesto
 * pagado lo deja con saldo, así que deja de estar pagado.
 */
export async function recalculateQuote(
  tx: Prisma.TransactionClient,
  quoteId: string,
): Promise<Quote> {
  const [itemsAgg, groupsAgg, current] = await Promise.all([
    tx.quote_items.aggregate({
      where: { quote_id: quoteId },
      _sum: { subtotal: true },
    }),
    tx.application_groups.aggregate({
      where: { quote_id: quoteId },
      _sum: { subtotal: true },
    }),
    tx.quotes.findUniqueOrThrow({ where: { id: quoteId } }),
  ]);
  const totalAmount =
    Math.round(
      (Number(itemsAgg._sum.subtotal ?? 0) +
        Number(groupsAgg._sum.subtotal ?? 0)) *
        100,
    ) / 100;
  const record = await tx.quotes.update({
    where: { id: quoteId },
    data: {
      total_amount: totalAmount,
      status: deriveQuoteStatus(totalAmount, Number(current.total_paid)),
      updated_at: new Date(),
    },
    include: QUOTE_INCLUDE,
  });
  return QuoteMapper.toDomain(record);
}

@Injectable()
export class PrismaQuotesRepository implements IQuoteRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createForPatient(
    patientId: string,
    notes: string | null,
  ): Promise<Quote> {
    const record = await this.prisma.quotes.create({
      data: { patient_id: patientId, notes },
      include: QUOTE_INCLUDE,
    });
    return QuoteMapper.toDomain(record);
  }

  async findById(id: string): Promise<Quote | null> {
    const record = await this.prisma.quotes.findUnique({
      where: { id },
      include: QUOTE_INCLUDE,
    });
    return record ? QuoteMapper.toDomain(record) : null;
  }

  async findByPatient(patientId: string): Promise<Quote[]> {
    const records = await this.prisma.quotes.findMany({
      where: { patient_id: patientId },
      include: QUOTE_INCLUDE,
      orderBy: { created_at: 'desc' },
    });
    return records.map((r) => QuoteMapper.toDomain(r));
  }

  async findSharedByPatient(patientId: string): Promise<Quote[]> {
    const records = await this.prisma.quotes.findMany({
      where: { patient_id: patientId, shared_at: { not: null } },
      include: QUOTE_INCLUDE,
      orderBy: { created_at: 'desc' },
    });
    return records.map((r) => QuoteMapper.toDomain(r));
  }

  async share(quoteId: string): Promise<Quote> {
    await this.prisma.quotes.updateMany({
      where: { id: quoteId, shared_at: null },
      data: { shared_at: new Date() },
    });
    const record = await this.prisma.quotes.findUniqueOrThrow({
      where: { id: quoteId },
      include: QUOTE_INCLUDE,
    });
    return QuoteMapper.toDomain(record);
  }

  async addItems(quoteId: string, items: NewQuoteItemData[]): Promise<Quote> {
    return this.prisma.transaction(async (tx) => {
      await insertQuoteItems(tx, quoteId, items);
      return recalculateQuote(tx, quoteId);
    });
  }

  async addItemGroup(
    quoteId: string,
    data: NewQuoteItemGroupData,
  ): Promise<Quote> {
    return this.prisma.transaction(async (tx) => {
      await insertQuoteItemGroup(tx, quoteId, data);
      return recalculateQuote(tx, quoteId);
    });
  }

  async removeItemGroup(
    quoteId: string,
    itemId: string,
  ): Promise<Quote | null> {
    return this.prisma.transaction(async (tx) => {
      const item = await tx.quote_items.findUnique({ where: { id: itemId } });
      if (item?.quote_id !== quoteId) {
        return null;
      }
      if (item.application_group_id) {
        // Borra el grupo entero de una — sus quote_items caen por ON DELETE
        // CASCADE (una aplicación multi_tooth se cobra/borra como unidad).
        await tx.application_groups.delete({
          where: { id: item.application_group_id },
        });
      } else {
        await tx.quote_items.delete({ where: { id: itemId } });
      }
      return recalculateQuote(tx, quoteId);
    });
  }

  async addPayment(quoteId: string, data: NewPaymentData): Promise<Quote> {
    return this.prisma.transaction(async (tx) => {
      await tx.payments.create({
        data: {
          quote_id: quoteId,
          amount: data.amount,
          payment_method: data.paymentMethod ?? null,
          notes: data.notes ?? null,
        },
      });
      return this.recalculatePaymentsAndReturn(tx, quoteId);
    });
  }

  async createQrCharge(data: NewQrChargeData): Promise<QrCharge> {
    const record = await this.prisma.quote_qr_charges.create({
      data: {
        quote_id: data.quoteId,
        amount: data.amount,
        baneco_qr_id: data.qrId,
        baneco_transaction_id: data.transactionId,
        qr_image: data.qrImageBase64,
        ...(data.lines?.length && {
          lines: {
            create: data.lines.map((l) => ({
              quote_item_id: l.quoteItemId ?? null,
              application_group_id: l.applicationGroupId ?? null,
              amount: l.amount,
            })),
          },
        }),
      },
      include: { lines: true },
    });
    return QuoteMapper.qrChargeToDomain(record);
  }

  async findQrCharge(chargeId: string): Promise<QrCharge | null> {
    const record = await this.prisma.quote_qr_charges.findUnique({
      where: { id: chargeId },
      include: { lines: true },
    });
    return record ? QuoteMapper.qrChargeToDomain(record) : null;
  }

  async findQrChargeByQrId(qrId: string): Promise<QrCharge | null> {
    const record = await this.prisma.quote_qr_charges.findUnique({
      where: { baneco_qr_id: qrId },
      include: { lines: true },
    });
    return record ? QuoteMapper.qrChargeToDomain(record) : null;
  }

  async findPendingQrCharges(): Promise<QrCharge[]> {
    const records = await this.prisma.quote_qr_charges.findMany({
      where: { status: QrChargeStatus.PENDING },
      include: { lines: true },
      orderBy: { created_at: 'asc' },
    });
    return records.map((r) => QuoteMapper.qrChargeToDomain(r));
  }

  async findPendingPatientQrCharge(
    patientId: string,
  ): Promise<QrCharge | null> {
    const record = await this.prisma.quote_qr_charges.findFirst({
      where: {
        status: QrChargeStatus.PENDING,
        lines: { some: {} },
        quotes: { patient_id: patientId },
      },
      include: { lines: true },
      orderBy: { created_at: 'desc' },
    });
    return record ? QuoteMapper.qrChargeToDomain(record) : null;
  }

  async settleQrCharge(chargeId: string): Promise<Quote | null> {
    return this.prisma.transaction(async (tx) => {
      // Primero el cambio de estado, con guarda: si dos verificaciones llegan
      // juntas, la segunda espera el lock de la fila y ve count 0.
      const claimed = await tx.quote_qr_charges.updateMany({
        where: { id: chargeId, status: QrChargeStatus.PENDING },
        data: { status: QrChargeStatus.PAID, updated_at: new Date() },
      });
      if (claimed.count === 0) {
        return null;
      }
      const charge = await tx.quote_qr_charges.findUniqueOrThrow({
        where: { id: chargeId },
      });
      const payment = await tx.payments.create({
        data: {
          quote_id: charge.quote_id,
          amount: charge.amount,
          payment_method: PaymentMethod.QR_BANECO,
          notes: `QR BANECO ${charge.baneco_qr_id}`,
        },
      });
      await tx.quote_qr_charges.update({
        where: { id: chargeId },
        data: { payment_id: payment.id },
      });
      return this.recalculatePaymentsAndReturn(tx, charge.quote_id);
    });
  }

  async cancelQrCharge(chargeId: string): Promise<boolean> {
    const result = await this.prisma.quote_qr_charges.updateMany({
      where: { id: chargeId, status: QrChargeStatus.PENDING },
      data: { status: QrChargeStatus.CANCELLED, updated_at: new Date() },
    });
    return result.count > 0;
  }

  private async recalculatePaymentsAndReturn(
    tx: Prisma.TransactionClient,
    quoteId: string,
  ): Promise<Quote> {
    const [agg, quote] = await Promise.all([
      tx.payments.aggregate({
        where: { quote_id: quoteId },
        _sum: { amount: true },
      }),
      tx.quotes.findUniqueOrThrow({ where: { id: quoteId } }),
    ]);
    const totalPaid = Number(agg._sum.amount ?? 0);
    const status = deriveQuoteStatus(Number(quote.total_amount), totalPaid);
    const record = await tx.quotes.update({
      where: { id: quoteId },
      data: {
        total_paid: totalPaid,
        status,
        updated_at: new Date(),
      },
      include: QUOTE_INCLUDE,
    });
    return QuoteMapper.toDomain(record);
  }
}
