import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { QuoteRepository } from '../domain/QuoteRepository';
import type { IQuoteRepository } from '../domain/QuoteRepository';
import type { Quote } from '../domain/Quote';
import { PaymentMethod } from '../domain/PaymentMethod';
import { TreatmentRepository } from '../../treatments/domain/TreatmentRepository';
import type { ITreatmentRepository } from '../../treatments/domain/TreatmentRepository';
import {
  assertTeethMatchApplicationType,
  InvalidApplicationTypeError,
  typeAllowsQuantity,
} from '../../treatments/domain/TreatmentApplicationType';
import { PatientRepository } from '../../patients/domain/PatientRepository';
import type { IPatientRepository } from '../../patients/domain/PatientRepository';
import { ExchangeRateProvider } from '../../exchange-rate/domain/ExchangeRateProvider';
import type { ExchangeRateProvider as IExchangeRateProvider } from '../../exchange-rate/domain/ExchangeRateProvider';
import { buildQuoteLine, priceInBob } from './quote-pricing';

interface AddQuoteItemInput {
  treatmentId: string;
  toothNumbers?: number[];
  customPrice?: number;
  quantity?: number;
}

interface AddPaymentInput {
  amount: number;
  paymentMethod?: string;
  notes?: string;
}

/** No se cobra más que el saldo pendiente (CLI-159) — vale para efectivo y QR. */
export function assertWithinBalance(quote: Quote, amount: number): void {
  if (amount > quote.balance) {
    throw new BadRequestException(
      `El monto (Bs. ${amount.toFixed(2)}) supera el saldo pendiente (Bs. ${quote.balance.toFixed(2)})`,
    );
  }
}

@Injectable()
export class QuotesService {
  constructor(
    @Inject(QuoteRepository)
    private readonly quoteRepo: IQuoteRepository,
    @Inject(TreatmentRepository)
    private readonly treatmentRepo: ITreatmentRepository,
    @Inject(PatientRepository)
    private readonly patientRepo: IPatientRepository,
    @Inject(ExchangeRateProvider)
    private readonly exchangeRateProvider: IExchangeRateProvider,
  ) {}

  async createForPatient(patientId: string, notes?: string): Promise<Quote> {
    await this.requirePatient(patientId);
    // Solo después de terminar el diagnóstico (CLI-189).
    if (!(await this.patientRepo.findCurrentDentalExam(patientId))) {
      throw new ConflictException(
        'Primero termina el diagnóstico del paciente.',
      );
    }
    return this.quoteRepo.createForPatient(patientId, notes ?? null);
  }

  async findByPatient(patientId: string): Promise<Quote[]> {
    await this.requirePatient(patientId);
    return this.quoteRepo.findByPatient(patientId);
  }

  async findById(quoteId: string): Promise<Quote> {
    const quote = await this.quoteRepo.findById(quoteId);
    if (!quote) {
      throw new NotFoundException(
        `Presupuesto con id ${quoteId} no encontrado`,
      );
    }
    return quote;
  }

  async addItem(quoteId: string, data: AddQuoteItemInput): Promise<Quote> {
    const quote = await this.quoteRepo.findById(quoteId);
    if (!quote) {
      throw new NotFoundException(
        `Presupuesto con id ${quoteId} no encontrado`,
      );
    }
    const treatment = await this.treatmentRepo.findById(data.treatmentId);
    if (!treatment) {
      throw new NotFoundException(
        `Tratamiento con id ${data.treatmentId} no encontrado`,
      );
    }

    const toothNumbers = data.toothNumbers ?? [];
    try {
      assertTeethMatchApplicationType(treatment.applicationType, toothNumbers);
    } catch (error: unknown) {
      if (error instanceof InvalidApplicationTypeError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }

    const quantity = data.quantity ?? 1;
    if (quantity > 1 && !typeAllowsQuantity(treatment.applicationType)) {
      throw new BadRequestException(
        'Solo los tratamientos sin dientes ni arcadas admiten cantidad mayor a 1',
      );
    }

    const price = await priceInBob(
      data.customPrice ?? treatment.basePrice,
      treatment.currency,
      this.exchangeRateProvider,
    );
    const line = buildQuoteLine(
      treatment.applicationType,
      toothNumbers,
      treatment.id,
      price.amount,
      quantity,
      treatment.currency,
      price.exchangeRate,
    );
    return line.kind === 'group'
      ? this.quoteRepo.addItemGroup(quoteId, line.group)
      : this.quoteRepo.addItems(quoteId, line.rows);
  }

  async addPayment(quoteId: string, data: AddPaymentInput): Promise<Quote> {
    const quote = await this.quoteRepo.findById(quoteId);
    if (!quote) {
      throw new NotFoundException(
        `Presupuesto con id ${quoteId} no encontrado`,
      );
    }
    assertWithinBalance(quote, data.amount);
    return this.quoteRepo.addPayment(quoteId, {
      amount: data.amount,
      paymentMethod: data.paymentMethod ?? PaymentMethod.CASH,
      notes: data.notes ?? null,
    });
  }

  /** Lo que ve el paciente: solo presupuestos compartidos (CLI-156). */
  async findSharedByPatient(patientId: string): Promise<Quote[]> {
    return this.quoteRepo.findSharedByPatient(patientId);
  }

  /** "Guardar y compartir" (CLI-156): desde acá el paciente lo ve. */
  async share(quoteId: string): Promise<Quote> {
    const quote = await this.quoteRepo.findById(quoteId);
    if (!quote) {
      throw new NotFoundException(
        `Presupuesto con id ${quoteId} no encontrado`,
      );
    }
    if (quote.items.length === 0) {
      throw new BadRequestException(
        'No se puede compartir un presupuesto sin tratamientos',
      );
    }
    return this.quoteRepo.share(quoteId);
  }

  async removeItem(quoteId: string, itemId: string): Promise<Quote> {
    // CLI-226: lo que ya se realizó se debe — no se quita del presupuesto.
    const current = await this.quoteRepo.findById(quoteId);
    const target = current?.items.find((i) => i.id === itemId);
    if (target) {
      const lineKey = target.applicationGroupId ?? target.id;
      const line = current?.lines.find((l) => l.key === lineKey);
      if (line?.performedAt) {
        throw new ConflictException(
          'Este tratamiento ya se realizó: no se puede quitar del presupuesto.',
        );
      }
    }
    const quote = await this.quoteRepo.removeItemGroup(quoteId, itemId);
    if (!quote) {
      throw new NotFoundException(
        `Línea de presupuesto con id ${itemId} no encontrada`,
      );
    }
    return quote;
  }

  private async requirePatient(patientId: string): Promise<void> {
    const patient = await this.patientRepo.findPatientById(patientId);
    if (!patient) {
      throw new NotFoundException(`Paciente con id ${patientId} no encontrado`);
    }
  }
}
