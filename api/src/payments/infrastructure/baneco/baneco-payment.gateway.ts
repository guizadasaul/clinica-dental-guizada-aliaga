import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { BanecoApiError, BanecoClient } from './baneco.client.js';
import {
  GeneratedQr,
  GenerateQrParams,
  PaymentGateway,
  QrPaymentInfo,
  QrStatus,
  QrStatusResult,
} from '../../domain/PaymentGateway.js';

interface GenerateQrResponse {
  qrId: string;
  qrImage: string;
  responseCode: number;
  message: string;
}

interface BanecoPaymentQr {
  qrId: string;
  transactionId: string;
  paymentDate?: string;
  paymentTime?: string;
  currency: string;
  amount: number;
  senderName?: string;
}

interface StatusQrResponse {
  statusQrCode: number;
  // La doc de BANECO muestra este campo tanto como objeto suelto como array
  // de un elemento según el ejemplo — se acepta cualquiera de las dos formas.
  payment: BanecoPaymentQr | BanecoPaymentQr[] | null;
  responseCode: number;
  message: string;
}

const STATUS_CODE_MAP: Record<number, QrStatus> = {
  0: QrStatus.PENDING,
  1: QrStatus.PAID,
  9: QrStatus.CANCELLED,
};

function formatDueDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function firstPayment(
  payment: BanecoPaymentQr | BanecoPaymentQr[] | null,
): BanecoPaymentQr | null {
  if (!payment) {
    return null;
  }
  return Array.isArray(payment) ? (payment[0] ?? null) : payment;
}

/**
 * Implementación real del puerto PaymentGateway contra la API Market de
 * BANECO. Cualquier falla de red/credenciales se traduce a 503 — nunca a
 * 401, que dispararía el redirect global del frontend a /auth/login sobre
 * un visitante anónimo.
 */
@Injectable()
export class BanecoPaymentGateway implements PaymentGateway {
  constructor(private readonly client: BanecoClient) {}

  async generateQr(params: GenerateQrParams): Promise<GeneratedQr> {
    try {
      const response = await this.client.post<GenerateQrResponse>(
        '/api/qrsimple/generateQR',
        {
          transactionId: params.transactionId,
          accountCredit: this.client.encryptField(this.client.accountCredit),
          currency: 'BOB',
          amount: params.amount,
          description: params.description,
          dueDate: formatDueDate(params.dueDate),
          singleUse: true,
          modifyAmount: false,
          ...(this.client.branchCode
            ? { branchCode: this.client.branchCode }
            : {}),
        },
      );
      return { qrId: response.qrId, qrImageBase64: response.qrImage };
    } catch (error) {
      throw this.toServiceUnavailable(error);
    }
  }

  async getQrStatus(qrId: string): Promise<QrStatusResult> {
    try {
      const response = await this.client.get<StatusQrResponse>(
        `/api/qrsimple/v2/statusQR/${qrId}`,
      );
      const status = STATUS_CODE_MAP[response.statusQrCode] ?? QrStatus.PENDING;
      const payment = firstPayment(response.payment);
      const paymentInfo: QrPaymentInfo | null = payment
        ? {
            qrId: payment.qrId,
            transactionId: payment.transactionId,
            amount: payment.amount,
            currency: payment.currency,
            paidAt: payment.paymentDate ? new Date(payment.paymentDate) : null,
            senderName: payment.senderName ?? null,
          }
        : null;
      return { status, payment: paymentInfo };
    } catch (error) {
      throw this.toServiceUnavailable(error);
    }
  }

  private toServiceUnavailable(error: unknown): ServiceUnavailableException {
    const message =
      error instanceof BanecoApiError
        ? error.message
        : 'No se pudo comunicar con BANECO';
    return new ServiceUnavailableException(message);
  }
}
