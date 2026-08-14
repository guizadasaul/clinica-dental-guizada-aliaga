export interface QuoteItem {
  id: string;
  quoteId: string;
  treatmentId: string;
  toothNumber: number | null;
  applicationGroupId: string | null;
  unitPrice: number;
  quantity: number;
  subtotal: number;
  /** Moneda en la que se calculó unitPrice (siempre BOB, ver Quote.totalAmount) — trazabilidad de si el tratamiento cotizaba en USD. */
  currency: string;
  /** Tipo de cambio aplicado si currency del tratamiento era USD; null si ya estaba en BOB. */
  exchangeRate: number | null;
}
