import type { QuoteItem } from '../models/quote.model';

/** Una línea del presupuesto tal como la ve una persona: un tratamiento con todas sus piezas. */
export interface QuoteLine {
  readonly key: string;
  readonly treatmentName: string;
  readonly toothNumbers: number[];
  /** Siempre en Bs. */
  readonly total: number;
  /** CLI-228: cuándo se realizó (todas sus filas); null = por realizar. */
  readonly performedAt: string | null;
}

/** La fecha más reciente de las filas, si todas se realizaron (mismo criterio que el backend, CLI-226). */
export function linePerformedAt(rows: readonly QuoteItem[]): string | null {
  let latest: string | null = null;
  for (const row of rows) {
    if (!row.performedAt) { return null; }
    if (latest === null || row.performedAt > latest) { latest = row.performedAt; }
  }
  return latest;
}

/**
 * Junta las filas de una misma aplicación multiple_teeth (mismo
 * applicationGroupId) en una sola línea. Todas las filas de un grupo
 * reportan el subtotal del grupo (CLI-45), así que se toma el de la primera.
 */
export function groupQuoteLines(items: QuoteItem[]): QuoteLine[] {
  const groups = new Map<string, QuoteItem[]>();
  for (const item of items) {
    const key = item.applicationGroupId ?? item.id;
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return [...groups.entries()].map(([key, rows]) => ({
    key,
    treatmentName: rows[0].treatmentName,
    toothNumbers: rows.map((r) => r.toothNumber).filter((n): n is number => n !== null),
    total: rows[0].subtotal,
    performedAt: linePerformedAt(rows),
  }));
}

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: 'Efectivo',
  qr_baneco: 'QR BANECO',
};

/** Etiqueta legible del método; los pagos viejos tienen texto libre y se muestran tal cual. */
export function paymentMethodLabel(method: string | null): string {
  if (!method) { return '—'; }
  return PAYMENT_METHOD_LABELS[method] ?? method;
}
