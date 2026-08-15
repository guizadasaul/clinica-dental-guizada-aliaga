export interface GenerateQrParams {
  transactionId: string;
  amount: number;
  description: string;
  dueDate: Date;
}

export interface GeneratedQr {
  qrId: string;
  qrImageBase64: string;
}

export const QrStatus = {
  PENDING: 'pending',
  PAID: 'paid',
  CANCELLED: 'cancelled',
} as const;
export type QrStatus = (typeof QrStatus)[keyof typeof QrStatus];

export interface QrPaymentInfo {
  qrId: string;
  transactionId: string;
  amount: number;
  currency: string;
  paidAt: Date | null;
  senderName: string | null;
}

export interface QrStatusResult {
  status: QrStatus;
  payment: QrPaymentInfo | null;
}

/**
 * Abstrae la API de BANECO fuera del dominio — mismo patrón que
 * AccessTokenVerifier en auth/domain/. La implementación real
 * (BanecoPaymentGateway) vive en infrastructure/.
 */
export interface PaymentGateway {
  generateQr(params: GenerateQrParams): Promise<GeneratedQr>;
  /** Fuente de verdad para confirmar un pago — nunca confiar en el payload del webhook a solas. */
  getQrStatus(qrId: string): Promise<QrStatusResult>;
  /** Anula un QR de uso único no pagado para futuros pagos (doc BANECO §7.3). Usado por el sweep de holds vencidos. */
  cancelQr(qrId: string): Promise<void>;
}

export const PaymentGateway = Symbol('PaymentGateway');
