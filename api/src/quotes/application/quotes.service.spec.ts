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
    payments: [],
    ...overrides,
  };
}

function fakeTreatment(overrides: Partial<Treatment> = {}): Treatment {
  return {
    id: 'treatment-1',
    code: 'tratamiento',
    name: 'Tratamiento',
    description: null,
    basePrice: 100,
    estimatedMinutes: 30,
    applicationType: 'single_tooth',
    currency: 'BOB',
    categoryId: 'category-1',
    categoryCode: 'operatoria_dental',
    categoryName: 'Operatoria dental',
    categoryColor: '#16a34a',
    displayOrder: 0,
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
  addItemGroup: jest.fn(),
  removeItemGroup: jest.fn(),
  addPayment: jest.fn(),
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
    mockQuoteRepo.addItemGroup.mockResolvedValue(fakeQuote());
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

    describe('applicationType: single_tooth', () => {
      beforeEach(() => {
        mockTreatmentRepo.findById.mockResolvedValue(
          fakeTreatment({ applicationType: 'single_tooth', basePrice: 180 }),
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

    describe('applicationType: multiple_teeth', () => {
      beforeEach(() => {
        mockTreatmentRepo.findById.mockResolvedValue(
          fakeTreatment({ applicationType: 'multiple_teeth', basePrice: 1700 }),
        );
      });

      it('rejects with no teeth', async () => {
        await expect(
          service.addItem('quote-1', { treatmentId: 'treatment-1' }),
        ).rejects.toThrow(BadRequestException);
      });

      it('accepts a single tooth ("1 o varios dientes")', async () => {
        await expect(
          service.addItem('quote-1', {
            treatmentId: 'treatment-1',
            toothNumbers: [16],
          }),
        ).resolves.toBeDefined();
      });

      // CLI-45: el precio del grupo se crea una sola vez (application_groups),
      // no una fila por diente con ceros de relleno en las hermanas.
      it('calls addItemGroup once, with all teeth sorted and a single price', async () => {
        await service.addItem('quote-1', {
          treatmentId: 'treatment-1',
          toothNumbers: [18, 16, 17],
        });

        expect(mockQuoteRepo.addItemGroup).toHaveBeenCalledWith('quote-1', {
          treatmentId: 'treatment-1',
          toothNumbers: [16, 17, 18],
          unitPrice: 1700,
          subtotal: 1700,
          currency: 'BOB',
          exchangeRate: null,
        });
        expect(mockQuoteRepo.addItems).not.toHaveBeenCalled();
      });
    });

    describe.each(['upper_arch', 'lower_arch', 'full_mouth'] as const)(
      'applicationType: %s',
      (applicationType) => {
        beforeEach(() => {
          mockTreatmentRepo.findById.mockResolvedValue(
            fakeTreatment({ applicationType, basePrice: 400 }),
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

    describe('applicationType: general', () => {
      beforeEach(() => {
        mockTreatmentRepo.findById.mockResolvedValue(
          fakeTreatment({ applicationType: 'general', basePrice: 20 }),
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
          fakeTreatment({
            applicationType: 'single_tooth',
            currency: 'USD',
            basePrice: 700,
          }),
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

  describe('addPayment', () => {
    it('throws NotFoundException when the quote does not exist', async () => {
      mockQuoteRepo.findById.mockResolvedValue(null);

      await expect(
        service.addPayment('missing-quote', { amount: 100 }),
      ).rejects.toThrow(NotFoundException);
      expect(mockQuoteRepo.addPayment).not.toHaveBeenCalled();
    });

    it('delegates to the repository with the mapped data', async () => {
      const updated = fakeQuote({ totalPaid: 100 });
      mockQuoteRepo.addPayment.mockResolvedValue(updated);

      const result = await service.addPayment('quote-1', {
        amount: 100,
        paymentMethod: 'efectivo',
        notes: 'primer pago',
      });

      expect(mockQuoteRepo.addPayment).toHaveBeenCalledWith('quote-1', {
        amount: 100,
        paymentMethod: 'efectivo',
        notes: 'primer pago',
      });
      expect(result).toEqual(updated);
    });

    it('defaults paymentMethod and notes to null when not provided', async () => {
      mockQuoteRepo.addPayment.mockResolvedValue(fakeQuote());

      await service.addPayment('quote-1', { amount: 50 });

      expect(mockQuoteRepo.addPayment).toHaveBeenCalledWith('quote-1', {
        amount: 50,
        paymentMethod: null,
        notes: null,
      });
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

  describe('presupuestos del paciente', () => {
    it('createForPatient guarda las notas o null si no vinieron', async () => {
      mockQuoteRepo.createForPatient.mockResolvedValue(fakeQuote());

      await service.createForPatient('patient-1', 'plan');
      await service.createForPatient('patient-1');

      expect(mockQuoteRepo.createForPatient.mock.calls).toEqual([
        ['patient-1', 'plan'],
        ['patient-1', null],
      ]);
    });

    it('findByPatient lista los presupuestos del paciente', async () => {
      mockQuoteRepo.findByPatient.mockResolvedValue([fakeQuote()]);

      await expect(service.findByPatient('patient-1')).resolves.toHaveLength(1);
    });

    it.each([
      ['createForPatient', () => service.createForPatient('missing')],
      ['findByPatient', () => service.findByPatient('missing')],
    ])('%s responde 404 si el paciente no existe', async (_, call) => {
      mockPatientRepo.findPatientById.mockResolvedValue(null);

      await expect(call()).rejects.toThrow(NotFoundException);
      expect(mockQuoteRepo.createForPatient).not.toHaveBeenCalled();
      expect(mockQuoteRepo.findByPatient).not.toHaveBeenCalled();
    });
  });

  describe('findById', () => {
    it('devuelve el presupuesto', async () => {
      const quote = fakeQuote();
      mockQuoteRepo.findById.mockResolvedValue(quote);

      await expect(service.findById('quote-1')).resolves.toBe(quote);
    });

    it('responde 404 si no existe', async () => {
      mockQuoteRepo.findById.mockResolvedValue(null);

      await expect(service.findById('missing')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  it('addItem responde 404 si el tratamiento no existe', async () => {
    mockTreatmentRepo.findById.mockResolvedValue(null);

    await expect(
      service.addItem('quote-1', { treatmentId: 'missing' }),
    ).rejects.toThrow('Tratamiento con id missing no encontrado');
  });
});
