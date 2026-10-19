import type { QuoteItem } from '../models/quote.model';

/** La fecha más reciente de las filas, si todas se realizaron (mismo criterio que el backend, CLI-226). */
export function linePerformedAt(rows: readonly QuoteItem[]): string | null {
  let latest: string | null = null;
  for (const row of rows) {
    if (!row.performedAt) { return null; }
    if (latest === null || row.performedAt > latest) { latest = row.performedAt; }
  }
  return latest;
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
