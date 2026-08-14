import type { quotes, quote_items } from '@prisma/client';
import type { Quote } from '../../domain/Quote';
import type { QuoteItem } from '../../domain/QuoteItem';

type QuoteRecordWithItems = quotes & { quote_items: quote_items[] };

export class QuoteMapper {
  static toDomain(record: QuoteRecordWithItems): Quote {
    return {
      id: record.id,
      patientId: record.patient_id,
      totalAmount: Number(record.total_amount),
      totalPaid: Number(record.total_paid),
      status: record.status,
      notes: record.notes ?? null,
      createdAt: record.created_at,
      updatedAt: record.updated_at,
      items: record.quote_items.map((i) => QuoteMapper.itemToDomain(i)),
    };
  }

  static itemToDomain(record: quote_items): QuoteItem {
    return {
      id: record.id,
      quoteId: record.quote_id,
      treatmentId: record.treatment_id,
      toothNumber: record.tooth_number,
      applicationGroupId: record.application_group_id,
      unitPrice: Number(record.unit_price),
      quantity: record.quantity,
      subtotal: record.subtotal !== null ? Number(record.subtotal) : 0,
      currency: record.currency,
      exchangeRate:
        record.exchange_rate !== null ? Number(record.exchange_rate) : null,
    };
  }
}
