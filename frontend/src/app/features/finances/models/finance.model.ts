import type { Quote } from '../../quotes/models/quote.model';

/**
 * Un paciente en el selector de Finanzas (CLI-159, CLI-190): aparecen todos los
 * pacientes, los últimos con tratamiento primero. Sin presupuesto activo,
 * `quoteId` es null y los montos son 0 ("Al día").
 */
export interface PatientBalance {
  patientId: string;
  patientName: string;
  quoteId: string | null;
  totalAmount: number;
  totalPaid: number;
  balance: number;
  sharedAt: string | null;
  /** Cuándo recibió su último tratamiento; null si nunca recibió uno. */
  lastTreatmentAt: string | null;
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
