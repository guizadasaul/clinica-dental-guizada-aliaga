import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  QuotesService,
  assertWithinBalance,
} from '../../quotes/application/quotes.service';
import { QuoteRepository } from '../../quotes/domain/QuoteRepository';
import type {
  IQuoteRepository,
  NewQrChargeLineData,
} from '../../quotes/domain/QuoteRepository';
import type { PaymentAllocation } from '../../quotes/domain/QuoteBalance';
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
  /** CLI-218: tratamientos que cubre (QR del paciente); [] en los del doctor. */
  lines: PaymentAllocation[];
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
    lines: charge.lines,
  };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

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
    return toView(await this.issueQrCharge(quoteId, amount));
  }

  // ── QR del paciente (CLI-218) ───────────────────────────────────────────
  // El paciente siempre sale de la sesión; un presupuesto o un QR que no es
  // suyo (o un borrador) da el mismo 404 que uno inexistente.

  /**
   * Genera el QR por todo lo pendiente de los tratamientos que eligió. Un solo
   * QR pendiente a la vez: si ya tiene uno, que lo pague o lo anule.
   */
  async createPatientQrCharge(
    patientId: string,
    quoteId: string,
    lineKeys: string[],
  ): Promise<QrChargeView> {
    const quote = await this.requireOwnQuote(patientId, quoteId);
    if (await this.quoteRepo.findPendingPatientQrCharge(patientId)) {
      throw new ConflictException(
        'Ya tienes un QR pendiente. Págalo o anúlalo antes de generar otro.',
      );
    }

    const selected = [...new Set(lineKeys)].map((key) =>
      quote.lines.find((l) => l.key === key),
    );
    if (selected.some((line) => !line)) {
      throw new UnprocessableEntityException(
        'Alguno de los tratamientos elegidos no está en este presupuesto',
      );
    }
    const lines = selected.filter((l) => l !== undefined);
    if (lines.some((l) => l.pending <= 0)) {
      throw new UnprocessableEntityException(
        'Alguno de los tratamientos elegidos ya está pagado',
      );
    }

    const groupIds = new Set(
      quote.items.map((i) => i.applicationGroupId).filter(Boolean),
    );
    const chargeLines: NewQrChargeLineData[] = lines.map((l) =>
      groupIds.has(l.key)
        ? { applicationGroupId: l.key, amount: l.pending }
        : { quoteItemId: l.key, amount: l.pending },
    );
    const amount = round2(lines.reduce((sum, l) => sum + l.pending, 0));
    return toView(await this.issueQrCharge(quoteId, amount, chargeLines));
  }

  /** El QR pendiente que generó el paciente, para retomarlo; null si no tiene. */
  async getPendingPatientQrCharge(
    patientId: string,
  ): Promise<QrChargeView | null> {
    const charge = await this.quoteRepo.findPendingPatientQrCharge(patientId);
    return charge ? toView(charge) : null;
  }

  async verifyPatientQrCharge(
    patientId: string,
    chargeId: string,
  ): Promise<VerifyQrChargeResult> {
    await this.requireOwnCharge(patientId, chargeId);
    return this.verifyQrCharge(chargeId);
  }

  async cancelPatientQrCharge(
    patientId: string,
    chargeId: string,
  ): Promise<void> {
    await this.requireOwnCharge(patientId, chargeId);
    return this.cancelQrCharge(chargeId);
  }

  private async requireOwnQuote(
    patientId: string,
    quoteId: string,
  ): Promise<Quote> {
    const quote = await this.quoteRepo.findById(quoteId);
    if (!quote || quote.patientId !== patientId || !quote.sharedAt) {
      throw new NotFoundException('Presupuesto no encontrado');
    }
    return quote;
  }

  private async requireOwnCharge(
    patientId: string,
    chargeId: string,
  ): Promise<void> {
    const charge = await this.quoteRepo.findQrCharge(chargeId);
    const quote = charge ? await this.quoteRepo.findById(charge.quoteId) : null;
    if (!quote || quote.patientId !== patientId) {
      throw new NotFoundException('Cobro QR no encontrado');
    }
  }

  private async issueQrCharge(
    quoteId: string,
    amount: number,
    lines?: NewQrChargeLineData[],
  ): Promise<QrCharge> {
    const transactionId = `CGA-Q-${quoteId.slice(0, 8)}-${Date.now().toString(36)}`;
    const qr = await this.gateway.generateQr({
      transactionId,
      amount,
      description: 'Pago de tratamiento - Clínica Dental Guizada-Aliaga',
      dueDate: new Date(),
    });
    return this.quoteRepo.createQrCharge({
      quoteId,
      amount,
      qrId: qr.qrId,
      transactionId,
      qrImageBase64: qr.qrImageBase64,
      lines,
    });
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
