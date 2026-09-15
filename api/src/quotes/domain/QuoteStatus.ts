export type QuoteStatus = 'pending' | 'partially_paid' | 'paid';

export function deriveQuoteStatus(
  totalAmount: number,
  totalPaid: number,
): QuoteStatus {
  if (totalAmount > 0 && totalPaid >= totalAmount) {
    return 'paid';
  }
  if (totalPaid > 0) {
    return 'partially_paid';
  }
  return 'pending';
}
