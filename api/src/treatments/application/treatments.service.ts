import {
  ConflictException,
  Injectable,
  Inject,
  NotFoundException,
} from '@nestjs/common';
import { TreatmentRepository } from '../domain/TreatmentRepository';
import type {
  ITreatmentRepository,
  CreateTreatmentData,
  UpdateTreatmentData,
} from '../domain/TreatmentRepository';
import type { Treatment } from '../domain/Treatment';
import {
  ExchangeRateProvider,
  convertUsdToBob,
} from '../../exchange-rate/domain/ExchangeRateProvider';
import type { ExchangeRateProvider as IExchangeRateProvider } from '../../exchange-rate/domain/ExchangeRateProvider';
import type { PricedTreatment } from './PricedTreatment';

@Injectable()
export class TreatmentsService {
  constructor(
    @Inject(TreatmentRepository)
    private readonly treatmentRepo: ITreatmentRepository,
    @Inject(ExchangeRateProvider)
    private readonly exchangeRateProvider: IExchangeRateProvider,
  ) {}

  async findActive(): Promise<PricedTreatment[]> {
    const treatments = await this.treatmentRepo.findActive();
    const rate = await this.exchangeRateProvider.getUsdToBob();
    return treatments.map((t) => this.withBasePriceBob(t, rate?.rate ?? null));
  }

  async create(data: CreateTreatmentData): Promise<PricedTreatment> {
    try {
      const treatment = await this.treatmentRepo.create(data);
      return this.withBasePriceBob(treatment, await this.currentRate());
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : '';
      if (msg.includes('Unique constraint') || msg.includes('unique')) {
        throw new ConflictException('Ya existe un tratamiento con ese nombre');
      }
      throw error;
    }
  }

  async update(
    id: string,
    data: UpdateTreatmentData,
  ): Promise<PricedTreatment> {
    try {
      const treatment = await this.treatmentRepo.update(id, data);
      if (!treatment) {
        throw new NotFoundException(`Tratamiento con id ${id} no encontrado`);
      }
      return this.withBasePriceBob(treatment, await this.currentRate());
    } catch (error: unknown) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      const msg = error instanceof Error ? error.message : '';
      if (msg.includes('Unique constraint') || msg.includes('unique')) {
        throw new ConflictException('Ya existe un tratamiento con ese nombre');
      }
      throw error;
    }
  }

  private async currentRate(): Promise<number | null> {
    const rate = await this.exchangeRateProvider.getUsdToBob();
    return rate?.rate ?? null;
  }

  private withBasePriceBob(
    treatment: Treatment,
    rate: number | null,
  ): PricedTreatment {
    return {
      ...treatment,
      basePriceBob:
        treatment.currency === 'USD' && rate !== null
          ? convertUsdToBob(treatment.basePrice, rate)
          : null,
    };
  }
}
