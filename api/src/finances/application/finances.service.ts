import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  QuotesService,
  assertWithinBalance,
} from '../../quotes/application/quotes.service';
import { QuoteRepository } from '../../quotes/domain/QuoteRepository';
import type { IQuoteRepository } from '../../quotes/domain/QuoteRepository';
import type { Quote } from '../../quotes/domain/Quote';
import { QrChargeStatus } from '../../quotes/domain/QrCharge';
import type { QrCharge } from '../../quotes/domain/QrCharge';
import { PaymentGateway, QrStatus } from '../../payments/domain/PaymentGateway';
import type { PaymentGateway as IPaymentGateway } from '../../payments/domain/PaymentGateway';
import { FinancesReadRepository } from '../domain/FinancesReadRepository';
import type { IFinancesReadRepository } from '../domain/FinancesReadRepository';
import type { PatientBalance } from '../domain/PatientBalance';

const ACTIVE_STATUSES = new Set(['pending', 'partially_paid']);

export interface PatientFinanceDetail {
  patientId: string;
  patientName: string;
  /** El presupuesto activo; si no hay, el más reciente; null si nunca tuvo. */
  quote: Quote | null;
}

export interface QrChargeView {
  chargeId: string;
  quoteId: string;
  amount: number;
  qrImageBase64: string;
  status: QrChargeStatus;
}

export type VerifyQrChargeResult =
  | { status: typeof QrChargeStatus.PENDING }
  | { status: typeof QrChargeStatus.CANCELLED }
  | { status: typeof QrChargeStatus.PAID; quote: Quote };

function toView(charge: QrCharge): QrChargeView {
  return {
    chargeId: charge.id,
    quoteId: charge.quoteId,
    amount: charge.amount,
    qrImageBase64: charge.qrImageBase64,
    status: charge.status,
  };
}

/**
 * Finanzas (CLI-159): saldos por paciente y cobro de presupuestos con QR
 * BANECO. Sin polling: el QR se confirma solo cuando el doctor aprieta
 * "Verificar pago", que consulta el estado real a BANECO.
 */
@Injectable()
export class FinancesService {
  constructor(
    private readonly quotesService: QuotesService,
    @Inject(QuoteRepository)
    private readonly quoteRepo: IQuoteRepository,
    @Inject(FinancesReadRepository)
    private readonly readRepo: IFinancesReadRepository,
    @Inject(PaymentGateway)
    private readonly gateway: IPaymentGateway,
  ) {}

  listPatients(search?: string): Promise<PatientBalance[]> {
    return this.readRepo.listPatientsWithBalance(search);
  }

  async getPatientDetail(patientId: string): Promise<PatientFinanceDetail> {
    const patientName = await this.readRepo.findPatientName(patientId);
    if (patientName === null) {
      throw new NotFoundException(`Paciente con id ${patientId} no encontrado`);
    }
    const quotes = await this.quotesService.findByPatient(patientId);
    const quote =
      quotes.find((q) => ACTIVE_STATUSES.has(q.status)) ?? quotes[0] ?? null;
    return { patientId, patientName, quote };
  }

  async createQrCharge(quoteId: string, amount: number): Promise<QrChargeView> {
    const quote = await this.quotesService.findById(quoteId);
    assertWithinBalance(quote, amount);

    const transactionId = `CGA-Q-${quoteId.slice(0, 8)}-${Date.now().toString(36)}`;
    const qr = await this.gateway.generateQr({
      transactionId,
      amount,
      description: 'Pago de tratamiento - Clínica Dental Guizada-Aliaga',
      dueDate: new Date(),
    });
    const charge = await this.quoteRepo.createQrCharge({
      quoteId,
      amount,
      qrId: qr.qrId,
      transactionId,
      qrImageBase64: qr.qrImageBase64,
    });
    return toView(charge);
  }

  /**
   * Consulta a BANECO. Idempotente: si ya estaba pagado devuelve el
   * presupuesto sin volver a registrar el pago.
   */
  async verifyQrCharge(chargeId: string): Promise<VerifyQrChargeResult> {
    const charge = await this.requireCharge(chargeId);
    if (charge.status === QrChargeStatus.PAID) {
      return {
        status: QrChargeStatus.PAID,
        quote: await this.quotesService.findById(charge.quoteId),
      };
    }
    if (charge.status === QrChargeStatus.CANCELLED) {
      return { status: QrChargeStatus.CANCELLED };
    }

    const { status } = await this.gateway.getQrStatus(charge.qrId);
    if (status === QrStatus.CANCELLED) {
      await this.quoteRepo.cancelQrCharge(chargeId);
      return { status: QrChargeStatus.CANCELLED };
    }
    if (status !== QrStatus.PAID) {
      return { status: QrChargeStatus.PENDING };
    }

    // null = otra verificación simultánea ya lo registró: mismo resultado.
    const quote =
      (await this.quoteRepo.settleQrCharge(chargeId)) ??
      (await this.quotesService.findById(charge.quoteId));
    return { status: QrChargeStatus.PAID, quote };
  }

  /** Anula un QR sin pagar, en BANECO y acá. 409 si ya se pagó. */
  async cancelQrCharge(chargeId: string): Promise<void> {
    const charge = await this.requireCharge(chargeId);
    if (charge.status === QrChargeStatus.PAID) {
      throw new ConflictException('Este QR ya fue pagado, no se puede anular');
    }
    if (charge.status === QrChargeStatus.CANCELLED) {
      return;
    }
    await this.gateway.cancelQr(charge.qrId);
    await this.quoteRepo.cancelQrCharge(chargeId);
  }

  private async requireCharge(chargeId: string): Promise<QrCharge> {
    const charge = await this.quoteRepo.findQrCharge(chargeId);
    if (!charge) {
      throw new NotFoundException(`Cobro QR con id ${chargeId} no encontrado`);
    }
    return charge;
  }
}
