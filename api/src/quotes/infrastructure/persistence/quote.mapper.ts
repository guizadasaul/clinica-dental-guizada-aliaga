import type {
  quotes,
  quote_items,
  application_groups,
  payments,
  quote_qr_charges,
} from '@prisma/client';
import type { Quote } from '../../domain/Quote';
import type { QuoteItem } from '../../domain/QuoteItem';
import type { Payment } from '../../domain/Payment';
import type { QrCharge, QrChargeStatus } from '../../domain/QrCharge';

type QuoteItemRecordWithGroup = quote_items & {
  application_groups: application_groups | null;
  treatments: { name: string };
};
type QuoteRecordWithItems = quotes & {
  quote_items: QuoteItemRecordWithGroup[];
  payments: payments[];
};

export class QuoteMapper {
  static toDomain(record: QuoteRecordWithItems): Quote {
    const totalAmount = Number(record.total_amount);
    const totalPaid = Number(record.total_paid);
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
      items: record.quote_items.map((i) => QuoteMapper.itemToDomain(i)),
      payments: record.payments.map((p) => QuoteMapper.paymentToDomain(p)),
    };
  }

  // El precio de una fila agrupada (application_group_id NOT NULL) vive en
  // application_groups, no en la fila misma — CLI-45. Todas las filas de un
  // mismo grupo reportan el mismo precio (el del grupo), a diferencia del
  // viejo esquema donde solo una fila arbitraria lo tenía y el resto
  // facturaba 0.
  static itemToDomain(record: QuoteItemRecordWithGroup): QuoteItem {
    const group = record.application_groups;
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
    };
  }

  static paymentToDomain(record: payments): Payment {
    return {
      id: record.id,
      quoteId: record.quote_id,
      amount: Number(record.amount),
      paymentMethod: record.payment_method ?? null,
      receiptNumber: record.receipt_number,
      paymentDate: record.payment_date,
      notes: record.notes ?? null,
      createdAt: record.created_at,
    };
  }

  static qrChargeToDomain(record: quote_qr_charges): QrCharge {
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
    };
  }
}
