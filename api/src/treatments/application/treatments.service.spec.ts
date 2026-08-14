import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { TreatmentsService } from './treatments.service';
import { TreatmentRepository } from '../domain/TreatmentRepository';
import { ExchangeRateProvider } from '../../exchange-rate/domain/ExchangeRateProvider';
import type { Treatment } from '../domain/Treatment';

function fakeTreatment(overrides: Partial<Treatment> = {}): Treatment {
  return {
    id: 'treatment-1',
    name: 'Consulta',
    description: null,
    basePrice: 50,
    estimatedMinutes: 30,
    scope: 'tooth',
    currency: 'BOB',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

const mockTreatmentRepo = {
  findActive: jest.fn(),
  findById: jest.fn(),
  findDefaultConsultation: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
};

const mockExchangeRateProvider = {
  getUsdToBob: jest.fn(),
};

describe('TreatmentsService', () => {
  let service: TreatmentsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockExchangeRateProvider.getUsdToBob.mockResolvedValue(null);
    const module = await Test.createTestingModule({
      providers: [
        TreatmentsService,
        { provide: TreatmentRepository, useValue: mockTreatmentRepo },
        { provide: ExchangeRateProvider, useValue: mockExchangeRateProvider },
      ],
    }).compile();
    service = module.get(TreatmentsService);
  });

  describe('create', () => {
    it('passes scope and currency through to the repository', async () => {
      const created = fakeTreatment({ scope: 'multi_tooth', currency: 'USD' });
      mockTreatmentRepo.create.mockResolvedValue(created);

      const result = await service.create({
        name: 'Placa parcial',
        basePrice: 1400,
        scope: 'multi_tooth',
        currency: 'USD',
      });

      expect(mockTreatmentRepo.create).toHaveBeenCalledWith({
        name: 'Placa parcial',
        basePrice: 1400,
        scope: 'multi_tooth',
        currency: 'USD',
      });
      expect(result).toEqual({ ...created, basePriceBob: null });
    });

    it('translates a duplicate name into ConflictException', async () => {
      mockTreatmentRepo.create.mockRejectedValue(
        new Error('Unique constraint failed on the fields: (`name`)'),
      );

      await expect(
        service.create({
          name: 'Consulta',
          basePrice: 50,
          scope: 'none',
          currency: 'BOB',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('update', () => {
    it('throws NotFoundException when the treatment does not exist', async () => {
      mockTreatmentRepo.update.mockResolvedValue(null);

      await expect(
        service.update('missing-id', { basePrice: 60 }),
      ).rejects.toThrow(NotFoundException);
    });

    it('returns the updated treatment', async () => {
      const updated = fakeTreatment({ basePrice: 60 });
      mockTreatmentRepo.update.mockResolvedValue(updated);

      const result = await service.update('treatment-1', { basePrice: 60 });

      expect(result).toEqual({ ...updated, basePriceBob: null });
    });
  });

  describe('findActive — conversión de moneda (CLI-19)', () => {
    it('computes basePriceBob only for USD treatments', async () => {
      mockExchangeRateProvider.getUsdToBob.mockResolvedValue({
        rate: 11.66,
        fetchedAt: new Date(),
        source: 'Banco Central de Bolivia',
        stale: false,
      });
      mockTreatmentRepo.findActive.mockResolvedValue([
        fakeTreatment({ id: 'bob-1', currency: 'BOB', basePrice: 100 }),
        fakeTreatment({ id: 'usd-1', currency: 'USD', basePrice: 700 }),
      ]);

      const result = await service.findActive();

      expect(result.find((t) => t.id === 'bob-1')?.basePriceBob).toBeNull();
      expect(result.find((t) => t.id === 'usd-1')?.basePriceBob).toBe(8162);
    });

    it('returns basePriceBob null for USD treatments when no rate is available', async () => {
      mockExchangeRateProvider.getUsdToBob.mockResolvedValue(null);
      mockTreatmentRepo.findActive.mockResolvedValue([
        fakeTreatment({ id: 'usd-1', currency: 'USD', basePrice: 700 }),
      ]);

      const result = await service.findActive();

      expect(result[0].basePriceBob).toBeNull();
    });

    it('only calls the exchange rate provider once regardless of treatment count', async () => {
      mockExchangeRateProvider.getUsdToBob.mockResolvedValue({
        rate: 11.66,
        fetchedAt: new Date(),
        source: 'Banco Central de Bolivia',
        stale: false,
      });
      mockTreatmentRepo.findActive.mockResolvedValue([
        fakeTreatment({ currency: 'USD' }),
        fakeTreatment({ currency: 'USD' }),
        fakeTreatment({ currency: 'BOB' }),
      ]);

      await service.findActive();

      expect(mockExchangeRateProvider.getUsdToBob).toHaveBeenCalledTimes(1);
    });
  });
});
