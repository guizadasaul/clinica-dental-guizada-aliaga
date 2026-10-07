import type { PaymentAllocation, PaymentCoverage } from './QuoteBalance';

export interface Payment {
  id: string;
  quoteId: string;
  amount: number;
  paymentMethod: string | null;
  receiptNumber: string;
  paymentDate: Date;
  notes: string | null;
  createdAt: Date;
  /** CLI-218: a qué tratamientos lo asignó el paciente al generar el QR; [] si se reparte en orden. */
  allocations: PaymentAllocation[];
  /** CLI-218: a qué tratamientos se aplicó en definitiva (ver computeQuoteBalance). */
  covered: PaymentCoverage[];
}
