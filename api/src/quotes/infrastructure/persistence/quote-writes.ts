import type { Prisma } from '@prisma/client';
import type {
  NewQuoteItemData,
  NewQuoteItemGroupData,
} from '../../domain/QuoteRepository';
import type { Quote } from '../../domain/Quote';
import { deriveQuoteStatus } from '../../domain/QuoteStatus';
import { QuoteMapper } from './quote.mapper';

// Escrituras del presupuesto que corren dentro de una transacción ajena:
// las usan PrismaQuotesRepository, el registro de tratamientos (CLI-226) y
// el backfill (CLI-227, que corre con ts-node: por eso estos imports van
// sin sufijo .js).

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
  payments: {
    include: {
      qr_charge: { include: { lines: true } },
      // CLI-257: el pago de una reserva web va entero a su consulta.
      quote_item: { select: { id: true, application_group_id: true } },
    },
  },
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
