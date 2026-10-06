import { ConflictException, Inject, Injectable } from '@nestjs/common';
import {
  PatientsService,
  type CreateToothProcedureInput,
} from '../../patients/application/patients.service';
import type { ToothProcedure } from '../../patients/domain/ToothProcedure';
import type { Treatment } from '../../treatments/domain/Treatment';
import { typeAllowsQuantity } from '../../treatments/domain/TreatmentApplicationType';
import {
  ExchangeRateProvider,
  convertUsdToBob,
} from '../../exchange-rate/domain/ExchangeRateProvider';
import type { ExchangeRateProvider as IExchangeRateProvider } from '../../exchange-rate/domain/ExchangeRateProvider';
import { QuoteRepository } from '../domain/QuoteRepository';
import type { IQuoteRepository } from '../domain/QuoteRepository';
import type { Quote } from '../domain/Quote';
import {
  findOpenQuote,
  findPlanLine,
  type PlanLineMatch,
} from '../domain/QuotePlanMatching';
import {
  PlanLineTakenError,
  TreatmentPlanRepository,
  type ITreatmentPlanRepository,
  type LinePriceUpdate,
  type PlanEffect,
} from '../domain/TreatmentPlanRepository';
import { buildQuoteLine, priceInBob, round2 } from './quote-pricing';

/** Diferencia mínima para considerar que el precio cambió (medio centavo). */
const PRICE_TOLERANCE = 0.005;

/**
 * Registrar un tratamiento cumple el presupuesto (CLI-226): el presupuesto
 * es el plan que el doctor le propuso al paciente.
 * - Si lo registrado está en el plan, esa línea queda realizada; si el
 *   doctor cobró otro precio, la línea toma ese precio.
 * - Si no está, se suma al presupuesto abierto (o a uno nuevo), que queda
 *   compartido para que el paciente vea lo que debe.
 * Todo en una sola transacción (TreatmentPlanRepository).
 */
@Injectable()
export class TreatmentPlanService {
  constructor(
    private readonly patientsService: PatientsService,
    @Inject(QuoteRepository)
    private readonly quoteRepo: IQuoteRepository,
    @Inject(TreatmentPlanRepository)
    private readonly planRepo: ITreatmentPlanRepository,
    @Inject(ExchangeRateProvider)
    private readonly exchangeRates: IExchangeRateProvider,
  ) {}

  async registerProcedure(
    patientId: string,
    authUserId: string,
    data: CreateToothProcedureInput,
  ): Promise<ToothProcedure[]> {
    const { treatment, procedures } =
      await this.patientsService.prepareToothProcedure(
        patientId,
        authUserId,
        data,
      );
    const quantity = typeAllowsQuantity(treatment.applicationType)
      ? (data.quantity ?? 1)
      : 1;
    const toothNumbers = data.teeth.map((t) => t.number);
    const quotes = await this.quoteRepo.findByPatient(patientId);
    const match = findPlanLine(quotes, {
      treatmentId: treatment.id,
      applicationType: treatment.applicationType,
      toothNumbers,
    });
    const plan = match
      ? await this.fulfill(match, treatment, data.priceCharged, quantity)
      : await this.append(
          quotes,
          treatment,
          toothNumbers,
          data.priceCharged,
          quantity,
        );

    let created: ToothProcedure[];
    try {
      ({ procedures: created } = await this.planRepo.recordPerformedTreatment(
        patientId,
        procedures,
        plan,
      ));
    } catch (error: unknown) {
      if (error instanceof PlanLineTakenError) {
        throw new ConflictException(error.message);
      }
      throw error;
    }
    await this.patientsService.recordTreatmentInOdontogram(
      patientId,
      treatment,
      data.notes,
    );
    return created;
  }

  private async fulfill(
    match: PlanLineMatch,
    treatment: Treatment,
    priceCharged: number,
    quantity: number,
  ): Promise<PlanEffect> {
    const isGroup = match.items[0].applicationGroupId !== null;
    return {
      kind: 'fulfill',
      quoteId: match.quote.id,
      lineKey: match.lineKey,
      isGroup,
      itemIdByTooth: new Map(match.items.map((i) => [i.toothNumber, i.id])),
      price: await this.priceUpdate(match, treatment, priceCharged, quantity),
    };
  }

  /**
   * null si el doctor cobró lo mismo que decía el presupuesto. Si cambió, el
   * precio nuevo — con dos guardas de dinero: no por debajo de lo que el
   * paciente ya pagó de esa línea, y no mientras haya un QR pendiente en el
   * presupuesto (su monto se calculó con el precio de antes).
   */
  private async priceUpdate(
    match: PlanLineMatch,
    treatment: Treatment,
    priceCharged: number,
    quantity: number,
  ): Promise<LinePriceUpdate | null> {
    const [item] = match.items;
    const line = match.quote.lines.find((l) => l.key === match.lineKey);
    const currentTotal = line?.total ?? item.subtotal;

    // Un precio en USD se compara primero con el tipo de cambio con que se
    // presupuestó: si el doctor cobró lo mismo, no cambia nada.
    const atQuotedRate =
      treatment.currency === 'USD' && item.exchangeRate
        ? convertUsdToBob(priceCharged, item.exchangeRate)
        : priceCharged;
    const sameQuantity = item.quantity === quantity;
    if (
      sameQuantity &&
      Math.abs(round2(atQuotedRate) - currentTotal) < PRICE_TOLERANCE
    ) {
      return null;
    }

    const price = await priceInBob(
      priceCharged,
      treatment.currency,
      this.exchangeRates,
    );
    const subtotal = round2(price.amount);
    const paid = line?.paid ?? 0;
    if (subtotal + PRICE_TOLERANCE < paid) {
      throw new ConflictException(
        `No se puede registrar con Bs ${subtotal.toFixed(2)}: el paciente ya pagó Bs ${paid.toFixed(2)} de este tratamiento.`,
      );
    }
    await this.assertNoPendingQr(match.quote);
    return {
      unitPrice: round2(subtotal / quantity),
      quantity,
      subtotal,
      exchangeRate: price.exchangeRate,
    };
  }

  private async assertNoPendingQr(quote: Quote): Promise<void> {
    const pending = await this.quoteRepo.findPendingQrCharges();
    if (pending.some((c) => c.quoteId === quote.id)) {
      throw new ConflictException(
        'Hay un cobro por QR pendiente en este presupuesto. Espera a que se pague o se anule para cambiar el precio.',
      );
    }
  }

  private async append(
    quotes: Quote[],
    treatment: Treatment,
    toothNumbers: number[],
    priceCharged: number,
    quantity: number,
  ): Promise<PlanEffect> {
    const price = await priceInBob(
      priceCharged,
      treatment.currency,
      this.exchangeRates,
    );
    // El precio registrado es el total (por unidad/caja ya viene
    // multiplicado): la línea guarda el unitario y la cantidad.
    const line = buildQuoteLine(
      treatment.applicationType,
      toothNumbers,
      treatment.id,
      round2(price.amount / quantity),
      quantity,
      treatment.currency,
      price.exchangeRate,
    );
    return {
      kind: 'append',
      quoteId: findOpenQuote(quotes)?.id ?? null,
      line,
    };
  }
}
