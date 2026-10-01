import type { QuoteItem } from '../models/quote.model';

/** Una línea del presupuesto tal como la ve una persona: un tratamiento con todas sus piezas. */
export interface QuoteLine {
  readonly key: string;
  readonly treatmentName: string;
  readonly toothNumbers: number[];
  /** Siempre en Bs. */
  readonly total: number;
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
