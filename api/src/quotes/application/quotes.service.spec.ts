import {
  BadRequestException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { QuotesService } from './quotes.service';
import { QuoteRepository } from '../domain/QuoteRepository';
import type { Quote } from '../domain/Quote';
import { TreatmentRepository } from '../../treatments/domain/TreatmentRepository';
import type { Treatment } from '../../treatments/domain/Treatment';
import { PatientRepository } from '../../patients/domain/PatientRepository';
import { ExchangeRateProvider } from '../../exchange-rate/domain/ExchangeRateProvider';

function fakeQuote(overrides: Partial<Quote> = {}): Quote {
  return {
    id: 'quote-1',
    patientId: 'patient-1',
    totalAmount: 0,
    totalPaid: 0,
    status: 'pending',
    notes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    items: [],
    ...overrides,
  };
}

function fakeTreatment(overrides: Partial<Treatment> = {}): Treatment {
  return {
    id: 'treatment-1',
    name: 'Tratamiento',
    description: null,
    basePrice: 100,
    estimatedMinutes: 30,
    scope: 'tooth',
    currency: 'BOB',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

const mockQuoteRepo = {
  createForPatient: jest.fn(),
  findById: jest.fn(),
  findByPatient: jest.fn(),
  addItems: jest.fn(),
  removeItemGroup: jest.fn(),
};

const mockTreatmentRepo = {
  findActive: jest.fn(),
  findById: jest.fn(),
  findDefaultConsultation: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
};

const mockPatientRepo = {
  findAllWithUsers: jest.fn(),
  findPatientById: jest.fn(),
  findByUserId: jest.fn(),
  create: jest.fn(),
  updatePatient: jest.fn(),
  upsertMedicalHistory: jest.fn(),
  upsertHygieneHabits: jest.fn(),
  createClinicalExam: jest.fn(),
  createOdontogramEntries: jest.fn(),
  findOdontogramEntries: jest.fn(),
  createToothProcedures: jest.fn(),
  findToothProcedures: jest.fn(),
  appendOdontogramEntries: jest.fn(),
};

const mockExchangeRateProvider = {
  getUsdToBob: jest.fn(),
};

describe('QuotesService', () => {
  let service: QuotesService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPatientRepo.findPatientById.mockResolvedValue({ id: 'patient-1' });
    mockQuoteRepo.findById.mockResolvedValue(fakeQuote());
    mockQuoteRepo.addItems.mockResolvedValue(fakeQuote());
    const module = await Test.createTestingModule({
      providers: [
        QuotesService,
        { provide: QuoteRepository, useValue: mockQuoteRepo },
        { provide: TreatmentRepository, useValue: mockTreatmentRepo },
        { provide: PatientRepository, useValue: mockPatientRepo },
        { provide: ExchangeRateProvider, useValue: mockExchangeRateProvider },
      ],
    }).compile();
    service = module.get(QuotesService);
  });

  describe('addItem — reglas de alcance', () => {
    it('rejects when the quote does not exist', async () => {
      mockQuoteRepo.findById.mockResolvedValue(null);

      await expect(
        service.addItem('missing-quote', { treatmentId: 'treatment-1' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects when the treatment does not exist', async () => {
      mockTreatmentRepo.findById.mockResolvedValue(null);

      await expect(
        service.addItem('quote-1', { treatmentId: 'missing-treatment' }),
      ).rejects.toThrow(NotFoundException);
    });

    describe('scope: tooth', () => {
      beforeEach(() => {
        mockTreatmentRepo.findById.mockResolvedValue(
          fakeTreatment({ scope: 'tooth', basePrice: 180 }),
        );
      });

      it('rejects with no teeth', async () => {
        await expect(
          service.addItem('quote-1', { treatmentId: 'treatment-1' }),
        ).rejects.toThrow(BadRequestException);
      });

      it('rejects with 2 teeth', async () => {
        await expect(
          service.addItem('quote-1', {
            treatmentId: 'treatment-1',
            toothNumbers: [16, 17],
          }),
        ).rejects.toThrow(BadRequestException);
      });

      it('creates a single row with the treatment basePrice', async () => {
        await service.addItem('quote-1', {
          treatmentId: 'treatment-1',
          toothNumbers: [16],
        });

        expect(mockQuoteRepo.addItems).toHaveBeenCalledWith('quote-1', [
          expect.objectContaining({
            toothNumber: 16,
            applicationGroupId: null,
            unitPrice: 180,
            quantity: 1,
            subtotal: 180,
          }),
        ]);
      });

      it('uses customPrice over basePrice when provided', async () => {
        await service.addItem('quote-1', {
          treatmentId: 'treatment-1',
          toothNumbers: [16],
          customPrice: 150,
        });

        expect(mockQuoteRepo.addItems).toHaveBeenCalledWith('quote-1', [
          expect.objectContaining({ unitPrice: 150, subtotal: 150 }),
        ]);
      });
    });

    describe('scope: multi_tooth', () => {
      beforeEach(() => {
        mockTreatmentRepo.findById.mockResolvedValue(
          fakeTreatment({ scope: 'multi_tooth', basePrice: 1700 }),
        );
      });

      it('rejects with a single tooth', async () => {
        await expect(
          service.addItem('quote-1', {
            treatmentId: 'treatment-1',
            toothNumbers: [16],
          }),
        ).rejects.toThrow(BadRequestException);
      });

      it('creates one row per tooth sharing an applicationGroupId, subtotal only on the lowest tooth', async () => {
        await service.addItem('quote-1', {
          treatmentId: 'treatment-1',
          toothNumbers: [18, 16, 17],
        });

        const [, rows] = mockQuoteRepo.addItems.mock.calls[0] as [
          string,
          {
            toothNumber: number;
            applicationGroupId: string;
            unitPrice: number;
            subtotal: number;
          }[],
        ];
        expect(rows).toHaveLength(3);
        expect(rows.map((r) => r.toothNumber)).toEqual([16, 17, 18]);
        expect(new Set(rows.map((r) => r.applicationGroupId)).size).toBe(1);
        expect(rows[0].subtotal).toBe(1700);
        expect(rows[1].subtotal).toBe(0);
        expect(rows[2].subtotal).toBe(0);
      });
    });

    describe.each(['upper_arch', 'lower_arch', 'full_mouth'] as const)(
      'scope: %s',
      (scope) => {
        beforeEach(() => {
          mockTreatmentRepo.findById.mockResolvedValue(
            fakeTreatment({ scope, basePrice: 400 }),
          );
        });

        it('rejects when a tooth is specified', async () => {
          await expect(
            service.addItem('quote-1', {
              treatmentId: 'treatment-1',
              toothNumbers: [16],
            }),
          ).rejects.toThrow(BadRequestException);
        });

        it('creates a single row with no tooth and quantity 1', async () => {
          await service.addItem('quote-1', { treatmentId: 'treatment-1' });

          expect(mockQuoteRepo.addItems).toHaveBeenCalledWith('quote-1', [
            expect.objectContaining({
              toothNumber: null,
              quantity: 1,
              subtotal: 400,
            }),
          ]);
        });

        it('rejects quantity > 1', async () => {
          await expect(
            service.addItem('quote-1', {
              treatmentId: 'treatment-1',
              quantity: 3,
            }),
          ).rejects.toThrow(BadRequestException);
        });
      },
    );

    describe('scope: none', () => {
      beforeEach(() => {
        mockTreatmentRepo.findById.mockResolvedValue(
          fakeTreatment({ scope: 'none', basePrice: 20 }),
        );
      });

      it('rejects when a tooth is specified', async () => {
        await expect(
          service.addItem('quote-1', {
            treatmentId: 'treatment-1',
            toothNumbers: [16],
          }),
        ).rejects.toThrow(BadRequestException);
      });

      it('accepts quantity > 1, subtotal = unitPrice * quantity', async () => {
        await service.addItem('quote-1', {
          treatmentId: 'treatment-1',
          quantity: 3,
        });

        expect(mockQuoteRepo.addItems).toHaveBeenCalledWith('quote-1', [
          expect.objectContaining({
            toothNumber: null,
            quantity: 3,
            unitPrice: 20,
            subtotal: 60,
          }),
        ]);
      });
    });

    describe('conversión USD (CLI-19)', () => {
      beforeEach(() => {
        mockTreatmentRepo.findById.mockResolvedValue(
          fakeTreatment({ scope: 'tooth', currency: 'USD', basePrice: 700 }),
        );
      });

      it('converts unitPrice using the current rate and stores exchangeRate/currency', async () => {
        mockExchangeRateProvider.getUsdToBob.mockResolvedValue({
          rate: 11.66,
          fetchedAt: new Date(),
          source: 'Banco Central de Bolivia',
          stale: false,
        });

        await service.addItem('quote-1', {
          treatmentId: 'treatment-1',
          toothNumbers: [16],
        });

        expect(mockQuoteRepo.addItems).toHaveBeenCalledWith('quote-1', [
          expect.objectContaining({
            unitPrice: 8162,
            subtotal: 8162,
            currency: 'USD',
            exchangeRate: 11.66,
          }),
        ]);
      });

      it('throws ServiceUnavailableException when no rate is available', async () => {
        mockExchangeRateProvider.getUsdToBob.mockResolvedValue(null);

        await expect(
          service.addItem('quote-1', {
            treatmentId: 'treatment-1',
            toothNumbers: [16],
          }),
        ).rejects.toThrow(ServiceUnavailableException);
        expect(mockQuoteRepo.addItems).not.toHaveBeenCalled();
      });
    });
  });

  describe('removeItem', () => {
    it('throws NotFoundException when the item does not exist', async () => {
      mockQuoteRepo.removeItemGroup.mockResolvedValue(null);

      await expect(
        service.removeItem('quote-1', 'missing-item'),
      ).rejects.toThrow(NotFoundException);
    });

    it('returns the recalculated quote', async () => {
      const updated = fakeQuote({ totalAmount: 500 });
      mockQuoteRepo.removeItemGroup.mockResolvedValue(updated);

      const result = await service.removeItem('quote-1', 'item-1');

      expect(result).toEqual(updated);
    });
  });

  describe('createForPatient / findByPatient', () => {
    it('throws NotFoundException for a nonexistent patient', async () => {
      mockPatientRepo.findPatientById.mockResolvedValue(null);

      await expect(service.createForPatient('missing-patient')).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.findByPatient('missing-patient')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
