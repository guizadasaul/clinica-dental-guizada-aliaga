import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
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
import {
  PaymentGateway,
  QrStatus,
  type PaymentGateway as IPaymentGateway,
  type QrStatusResult,
} from '../../payments/domain/PaymentGateway';
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

/** CLI-220: anular nunca pierde un pago — si BANECO dice que ya se pagó, se registra. */
export type CancelQrChargeResult =
  | { status: typeof QrChargeStatus.CANCELLED }
  | { status: typeof QrChargeStatus.PAID; quote: Quote };

/** Más de un centavo de diferencia entre lo cobrado y lo que informa BANECO. */
const AMOUNT_TOLERANCE = 0.005;

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
  private readonly logger = new Logger(FinancesService.name);

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
   * Genera el QR por el saldo completo de los tratamientos que eligió. Un solo
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
  ): Promise<CancelQrChargeResult> {
    await this.requireOwnCharge(patientId, chargeId);
    return this.cancelQrCharge(chargeId);
  }

  private async requireOwnQuote(
    patientId: string,
    quoteId: string,
  ): Promise<Quote> {
    const quote = await this.quoteRepo.findById(quoteId);
    if (quote?.patientId !== patientId || !quote.sharedAt) {
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
    if (quote?.patientId !== patientId) {
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
   * presupuesto sin volver a registrar el pago. Lo usan el botón "Verificar
   * pago", el webhook de BANECO y la conciliación periódica (CLI-220).
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

    const result = await this.gateway.getQrStatus(charge.qrId);
    if (result.status === QrStatus.CANCELLED) {
      await this.quoteRepo.cancelQrCharge(chargeId);
      return { status: QrChargeStatus.CANCELLED };
    }
    if (result.status !== QrStatus.PAID) {
      return { status: QrChargeStatus.PENDING };
    }
    const quote = await this.settlePaid(charge, result);
    return quote
      ? { status: QrChargeStatus.PAID, quote }
      : { status: QrChargeStatus.PENDING };
  }

  /**
   * Anula un QR sin pagar (CLI-220: anulación segura). Nunca da por anulado
   * algo que BANECO cobró:
   * 1. pregunta el estado real; si ya está pagado, registra el pago y NO anula;
   * 2. si sigue pendiente, lo anula en BANECO y solo después lo marca acá;
   * 3. si BANECO falla al anular, vuelve a preguntar: pagado → se registra;
   *    si no, el error sube y el cobro sigue pendiente (lo retoma la
   *    conciliación periódica).
   */
  async cancelQrCharge(chargeId: string): Promise<CancelQrChargeResult> {
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

    const before = await this.gateway.getQrStatus(charge.qrId);
    const early = await this.resolveFinalStatus(charge, before);
    if (early) {
      return early;
    }

    try {
      await this.gateway.cancelQr(charge.qrId);
    } catch (error) {
      // Pudo haberse pagado justo antes: BANECO no anula un QR pagado.
      const after = await this.gateway.getQrStatus(charge.qrId);
      const resolved = await this.resolveFinalStatus(charge, after);
      if (resolved) {
        return resolved;
      }
      throw error;
    }

    if (await this.quoteRepo.cancelQrCharge(chargeId)) {
      return { status: QrChargeStatus.CANCELLED };
    }
    // Otra request lo cambió en el medio (p. ej. la conciliación lo registró).
    const latest = await this.requireCharge(chargeId);
    return latest.status === QrChargeStatus.PAID
      ? {
          status: QrChargeStatus.PAID,
          quote: await this.quotesService.findById(charge.quoteId),
        }
      : { status: QrChargeStatus.CANCELLED };
  }

  /** Los cobros QR que siguen pendientes, el más antiguo primero — para la conciliación periódica. */
  findPendingQrCharges(): Promise<QrCharge[]> {
    return this.quoteRepo.findPendingQrCharges();
  }

  findQrChargeByQrId(qrId: string): Promise<QrCharge | null> {
    return this.quoteRepo.findQrChargeByQrId(qrId);
  }

  /**
   * Con el estado que dio BANECO: pagado → se registra el pago; anulado allá
   * → se marca anulado acá. null si sigue pendiente (hay que anularlo).
   * Un pago con monto distinto al cobro no se registra ni se anula: queda
   * pendiente y en el log para revisión manual.
   */
  private async resolveFinalStatus(
    charge: QrCharge,
    result: QrStatusResult,
  ): Promise<CancelQrChargeResult | null> {
    if (result.status === QrStatus.CANCELLED) {
      await this.quoteRepo.cancelQrCharge(charge.id);
      return { status: QrChargeStatus.CANCELLED };
    }
    if (result.status !== QrStatus.PAID) {
      return null;
    }
    const quote = await this.settlePaid(charge, result);
    if (!quote) {
      throw new ConflictException(
        'El pago necesita una revisión de la clínica. Comunícate con nosotros.',
      );
    }
    return { status: QrChargeStatus.PAID, quote };
  }

  /**
   * Registra el pago de un QR que BANECO dio por pagado. Antes compara el
   * monto que informa BANECO con el del cobro: si no coincide, no registra
   * nada (devuelve null) y lo deja en el log para revisión manual.
   */
  private async settlePaid(
    charge: QrCharge,
    result: QrStatusResult,
  ): Promise<Quote | null> {
    const paidAmount = result.payment?.amount;
    if (
      paidAmount !== undefined &&
      Math.abs(paidAmount - charge.amount) > AMOUNT_TOLERANCE
    ) {
      this.logger.error(
        `PAGO QR CON MONTO DISTINTO — revisión manual. chargeId=${charge.id} qrId=${charge.qrId} cobrado=${charge.amount} pagado=${paidAmount}`,
      );
      return null;
    }
    // null = otra verificación simultánea ya lo registró: mismo resultado.
    return (
      (await this.quoteRepo.settleQrCharge(charge.id)) ??
      (await this.quotesService.findById(charge.quoteId))
    );
  }

  private async requireCharge(chargeId: string): Promise<QrCharge> {
    const charge = await this.quoteRepo.findQrCharge(chargeId);
    if (!charge) {
      throw new NotFoundException(`Cobro QR con id ${chargeId} no encontrado`);
    }
    return charge;
  }
}
