import type { PaymentAllocation } from './QuoteBalance';

export const QrChargeStatus = {
  PENDING: 'pending',
  PAID: 'paid',
  CANCELLED: 'cancelled',
} as const;
export type QrChargeStatus =
  (typeof QrChargeStatus)[keyof typeof QrChargeStatus];

/** Un cobro con QR BANECO de un presupuesto (CLI-159). */
export interface QrCharge {
  id: string;
  quoteId: string;
  amount: number;
  qrId: string;
  transactionId: string;
  qrImageBase64: string;
  status: QrChargeStatus;
  /** El pago que generó al confirmarse; null mientras no está pagado. */
  paymentId: string | null;
  createdAt: Date;
  /** CLI-218: tratamientos que cubre (QR que generó el paciente); [] en los del doctor. */
  lines: PaymentAllocation[];
}
