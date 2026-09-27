import type { Quote } from '../../quotes/models/quote.model';

/** Un paciente con presupuesto activo, para el selector de Finanzas (CLI-159). */
export interface PatientBalance {
  patientId: string;
  patientName: string;
  quoteId: string;
  totalAmount: number;
  totalPaid: number;
  balance: number;
  sharedAt: string | null;
}

export interface PatientFinanceDetail {
  patientId: string;
  patientName: string;
  /** El presupuesto activo; si no hay, el más reciente; null si nunca tuvo. */
  quote: Quote | null;
}

export type QrChargeStatus = 'pending' | 'paid' | 'cancelled';

export interface QrCharge {
  chargeId: string;
  quoteId: string;
  amount: number;
  qrImageBase64: string;
  status: QrChargeStatus;
}

export type VerifyQrChargeResult =
  | { status: 'pending' }
  | { status: 'cancelled' }
  | { status: 'paid'; quote: Quote };
