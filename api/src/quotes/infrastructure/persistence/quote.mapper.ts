import type {
  quotes,
  quote_items,
  application_groups,
  payments,
  quote_qr_charges,
  quote_qr_charge_lines,
} from '@prisma/client';
import type { Quote } from '../../domain/Quote';
import type { QuoteItem } from '../../domain/QuoteItem';
import type { Payment } from '../../domain/Payment';
import type { QrCharge, QrChargeStatus } from '../../domain/QrCharge';
import {
  computeQuoteBalance,
  type PaymentAllocation,
} from '../../domain/QuoteBalance';

type QuoteItemRecordWithGroup = quote_items & {
  application_groups: application_groups | null;
  treatments: { name: string };
  /** CLI-226: a lo sumo uno (tooth_procedures.quote_item_id es UNIQUE). */
  tooth_procedures?: { id: string; procedure_date: Date }[];
};
type PaymentRecord = payments & {
  qr_charge?: { lines: quote_qr_charge_lines[] } | null;
};
type QuoteRecordWithItems = quotes & {
  quote_items: QuoteItemRecordWithGroup[];
  payments: PaymentRecord[];
};
type QrChargeRecord = quote_qr_charges & { lines?: quote_qr_charge_lines[] };

export class QuoteMapper {
  static toDomain(record: QuoteRecordWithItems): Quote {
    const totalAmount = Number(record.total_amount);
    const totalPaid = Number(record.total_paid);
    const items = record.quote_items.map((i) => QuoteMapper.itemToDomain(i));
    const payments = record.payments.map((p) => QuoteMapper.paymentToDomain(p));
    // CLI-218: lo pagado/pendiente por tratamiento y qué cubrió cada pago.
    const { lines, coverage } = computeQuoteBalance(items, payments);
    return {
      id: record.id,
      patientId: record.patient_id,
      totalAmount,
      totalPaid,
      balance: Math.max(0, Math.round((totalAmount - totalPaid) * 100) / 100),
      status: record.status,
      notes: record.notes ?? null,
      createdAt: record.created_at,
      updatedAt: record.updated_at,
      sharedAt: record.shared_at ?? null,
      items,
      payments: payments.map((p) => ({
        ...p,
        covered: coverage.get(p.id) ?? [],
      })),
      lines,
    };
  }

  // El precio de una fila agrupada (application_group_id NOT NULL) vive en
  // application_groups, no en la fila misma — CLI-45. Todas las filas de un
  // mismo grupo reportan el mismo precio (el del grupo), a diferencia del
  // viejo esquema donde solo una fila arbitraria lo tenía y el resto
  // facturaba 0.
  static itemToDomain(record: QuoteItemRecordWithGroup): QuoteItem {
    const group = record.application_groups;
    const procedure = record.tooth_procedures?.[0];
    return {
      id: record.id,
      quoteId: record.quote_id,
      treatmentId: record.treatment_id,
      treatmentName: record.treatments.name,
      toothNumber: record.tooth_number,
      applicationGroupId: record.application_group_id,
      unitPrice: Number(group?.unit_price ?? record.unit_price ?? 0),
      quantity: record.quantity,
      subtotal: Number(group?.subtotal ?? record.subtotal ?? 0),
      currency: group?.currency ?? record.currency ?? 'BOB',
      exchangeRate:
        Number(group?.exchange_rate ?? record.exchange_rate ?? 0) || null,
      procedureId: procedure?.id ?? null,
      performedAt: procedure?.procedure_date ?? null,
    };
  }

  static paymentToDomain(record: PaymentRecord): Payment {
    return {
      id: record.id,
      quoteId: record.quote_id,
      amount: Number(record.amount),
      paymentMethod: record.payment_method ?? null,
      receiptNumber: record.receipt_number,
      paymentDate: record.payment_date,
      notes: record.notes ?? null,
      createdAt: record.created_at,
      allocations: QuoteMapper.linesToAllocations(
        record.qr_charge?.lines ?? [],
      ),
      covered: [],
    };
  }

  static linesToAllocations(
    lines: quote_qr_charge_lines[],
  ): PaymentAllocation[] {
    return lines.map((l) => ({
      lineKey: l.application_group_id ?? l.quote_item_id ?? '',
      amount: Number(l.amount),
    }));
  }

  static qrChargeToDomain(record: QrChargeRecord): QrCharge {
    return {
      id: record.id,
      quoteId: record.quote_id,
      amount: Number(record.amount),
      qrId: record.baneco_qr_id,
      transactionId: record.baneco_transaction_id,
      qrImageBase64: record.qr_image,
      status: record.status as QrChargeStatus,
      paymentId: record.payment_id,
      createdAt: record.created_at,
      lines: QuoteMapper.linesToAllocations(record.lines ?? []),
    };
  }
}
