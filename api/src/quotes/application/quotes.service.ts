import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { QuoteRepository } from '../domain/QuoteRepository';
import type {
  IQuoteRepository,
  NewQuoteItemData,
} from '../domain/QuoteRepository';
import type { Quote } from '../domain/Quote';
import { TreatmentRepository } from '../../treatments/domain/TreatmentRepository';
import type { ITreatmentRepository } from '../../treatments/domain/TreatmentRepository';
import {
  assertTeethMatchApplicationType,
  InvalidApplicationTypeError,
  typeAllowsQuantity,
} from '../../treatments/domain/TreatmentApplicationType';
import type { TreatmentApplicationType } from '../../treatments/domain/TreatmentApplicationType';
import { PatientRepository } from '../../patients/domain/PatientRepository';
import type { IPatientRepository } from '../../patients/domain/PatientRepository';
import {
  ExchangeRateProvider,
  convertUsdToBob,
} from '../../exchange-rate/domain/ExchangeRateProvider';
import type { ExchangeRateProvider as IExchangeRateProvider } from '../../exchange-rate/domain/ExchangeRateProvider';

interface AddQuoteItemInput {
  treatmentId: string;
  toothNumbers?: number[];
  customPrice?: number;
  quantity?: number;
}

function round2(amount: number): number {
  return Math.round(amount * 100) / 100;
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

    const amount = data.customPrice ?? treatment.basePrice;
    let unitPrice = amount;
    let exchangeRate: number | null = null;
    if (treatment.currency === 'USD') {
      const rate = await this.exchangeRateProvider.getUsdToBob();
      if (!rate) {
        throw new ServiceUnavailableException(
          'No se pudo obtener el tipo de cambio para calcular el precio en bolivianos. Intentá de nuevo en unos minutos.',
        );
      }
      unitPrice = convertUsdToBob(amount, rate.rate);
      exchangeRate = rate.rate;
    }

    const rows = this.buildQuoteItemRows(
      treatment.applicationType,
      toothNumbers,
      treatment.id,
      unitPrice,
      quantity,
      treatment.currency,
      exchangeRate,
    );
    return this.quoteRepo.addItems(quoteId, rows);
  }

  async removeItem(quoteId: string, itemId: string): Promise<Quote> {
    const quote = await this.quoteRepo.removeItemGroup(quoteId, itemId);
    if (!quote) {
      throw new NotFoundException(
        `Línea de presupuesto con id ${itemId} no encontrada`,
      );
    }
    return quote;
  }

  private buildQuoteItemRows(
    applicationType: TreatmentApplicationType,
    toothNumbers: number[],
    treatmentId: string,
    unitPrice: number,
    quantity: number,
    currency: string,
    exchangeRate: number | null,
  ): NewQuoteItemData[] {
    const shared = { treatmentId, currency, exchangeRate };

    if (applicationType === 'multiple_teeth') {
      const applicationGroupId = randomUUID();
      const sortedTeeth = [...toothNumbers].sort((a, b) => a - b);
      return sortedTeeth.map((toothNumber, index) => {
        const rowUnitPrice = index === 0 ? unitPrice : 0;
        return {
          ...shared,
          toothNumber,
          applicationGroupId,
          unitPrice: rowUnitPrice,
          quantity: 1,
          subtotal: round2(rowUnitPrice),
        };
      });
    }

    if (applicationType === 'single_tooth') {
      return [
        {
          ...shared,
          toothNumber: toothNumbers[0],
          applicationGroupId: null,
          unitPrice,
          quantity: 1,
          subtotal: round2(unitPrice),
        },
      ];
    }

    return [
      {
        ...shared,
        toothNumber: null,
        applicationGroupId: null,
        unitPrice,
        quantity,
        subtotal: round2(unitPrice * quantity),
      },
    ];
  }

  private async requirePatient(patientId: string): Promise<void> {
    const patient = await this.patientRepo.findPatientById(patientId);
    if (!patient) {
      throw new NotFoundException(`Paciente con id ${patientId} no encontrado`);
    }
  }
}
