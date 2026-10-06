import { ConflictException } from '@nestjs/common';
import { TreatmentPlanService } from './treatment-plan.service';
import type { PatientsService } from '../../patients/application/patients.service';
import type { IQuoteRepository } from '../domain/QuoteRepository';
import {
  PlanLineTakenError,
  type PlanEffect,
} from '../domain/TreatmentPlanRepository';
import type { Quote } from '../domain/Quote';
import type { QuoteItem } from '../domain/QuoteItem';
import type { Treatment } from '../../treatments/domain/Treatment';

function treatment(extra: Partial<Treatment> = {}): Treatment {
  return {
    id: 'conducto',
    name: 'Conducto',
    applicationType: 'single_tooth',
    currency: 'BOB',
    basePrice: 300,
    ...extra,
  } as Treatment;
}

function item(id: string, extra: Partial<QuoteItem> = {}): QuoteItem {
  return {
    id,
    quoteId: 'q-1',
    treatmentId: 'conducto',
    treatmentName: 'Conducto',
    toothNumber: 14,
    applicationGroupId: null,
    unitPrice: 300,
    quantity: 1,
    subtotal: 300,
    currency: 'BOB',
    exchangeRate: null,
    procedureId: null,
    performedAt: null,
    ...extra,
  };
}

function quote(items: QuoteItem[], extra: Partial<Quote> = {}): Quote {
  return {
    id: 'q-1',
    patientId: 'p-1',
    totalAmount: 300,
    totalPaid: 0,
    balance: 300,
    status: 'pending',
    notes: null,
    createdAt: new Date('2026-02-25'),
    updatedAt: new Date('2026-02-25'),
    sharedAt: new Date('2026-02-25'),
    items,
    payments: [],
    lines: items.map((i) => ({
      key: i.applicationGroupId ?? i.id,
      treatmentName: i.treatmentName,
      toothNumbers: i.toothNumber === null ? [] : [i.toothNumber],
      total: i.subtotal,
      paid: 0,
      pending: i.subtotal,
      performedAt: null,
    })),
    ...extra,
  };
}

const ROWS = {
  kind: 'rows' as const,
  rows: [
    {
      toothNumber: 14,
      treatmentId: 'conducto',
      priceCharged: 300,
      performedBy: 'doctor-1',
    },
  ],
};

describe('TreatmentPlanService (CLI-226)', () => {
  const patientsService = {
    prepareToothProcedure: jest.fn(),
    recordTreatmentInOdontogram: jest.fn(),
  };
  const quoteRepo = {
    findByPatient: jest.fn(),
    findPendingQrCharges: jest.fn(),
  };
  const planRepo = { recordPerformedTreatment: jest.fn() };
  const exchangeRates = { getUsdToBob: jest.fn() };
  let service: TreatmentPlanService;

  const register = (priceCharged = 300, extra: Record<string, unknown> = {}) =>
    service.registerProcedure('p-1', 'doctor-auth', {
      teeth: [{ number: 14 }],
      treatmentId: 'conducto',
      priceCharged,
      ...extra,
    });
  const planOf = () =>
    (
      planRepo.recordPerformedTreatment.mock.calls[0] as unknown[]
    )[2] as PlanEffect;

  beforeEach(() => {
    jest.resetAllMocks();
    patientsService.prepareToothProcedure.mockResolvedValue({
      treatment: treatment(),
      procedures: ROWS,
    });
    planRepo.recordPerformedTreatment.mockResolvedValue({
      procedures: [{ id: 'proc-1' }],
      quote: quote([]),
    });
    quoteRepo.findPendingQrCharges.mockResolvedValue([]);
    exchangeRates.getUsdToBob.mockResolvedValue({ rate: 6.96 });
    service = new TreatmentPlanService(
      patientsService as unknown as PatientsService,
      quoteRepo as unknown as IQuoteRepository,
      planRepo,
      exchangeRates,
    );
  });

  it('lo que está en el plan cumple esa línea, sin tocar el precio si es el mismo', async () => {
    quoteRepo.findByPatient.mockResolvedValue([quote([item('a')])]);

    const result = await register(300);

    expect(result).toEqual([{ id: 'proc-1' }]);
    expect(planRepo.recordPerformedTreatment).toHaveBeenCalledWith(
      'p-1',
      ROWS,
      expect.objectContaining({
        kind: 'fulfill',
        quoteId: 'q-1',
        lineKey: 'a',
        isGroup: false,
        price: null,
      }),
    );
    expect(planOf()).toMatchObject({
      itemIdByTooth: new Map([[14, 'a']]),
    });
    expect(patientsService.recordTreatmentInOdontogram).toHaveBeenCalledWith(
      'p-1',
      treatment(),
      undefined,
    );
  });

  it('si el doctor cobró otro precio, la línea toma ese precio', async () => {
    quoteRepo.findByPatient.mockResolvedValue([quote([item('a')])]);

    await register(350);

    expect(planOf()).toMatchObject({
      kind: 'fulfill',
      price: { unitPrice: 350, quantity: 1, subtotal: 350, exchangeRate: null },
    });
  });

  it('no deja bajar el precio por debajo de lo que el paciente ya pagó de esa línea', async () => {
    const q = quote([item('a')]);
    q.lines[0].paid = 300;
    q.lines[0].pending = 0;
    quoteRepo.findByPatient.mockResolvedValue([q]);

    await expect(register(250)).rejects.toThrow(
      'el paciente ya pagó Bs 300.00 de este tratamiento',
    );
    expect(planRepo.recordPerformedTreatment).not.toHaveBeenCalled();
  });

  it('no deja cambiar el precio con un QR pendiente en ese presupuesto', async () => {
    quoteRepo.findByPatient.mockResolvedValue([quote([item('a')])]);
    quoteRepo.findPendingQrCharges.mockResolvedValue([
      { id: 'qr-1', quoteId: 'q-1' },
    ]);

    await expect(register(350)).rejects.toBeInstanceOf(ConflictException);
    expect(planRepo.recordPerformedTreatment).not.toHaveBeenCalled();
  });

  it('un QR pendiente no impide cumplir la línea si el precio no cambia', async () => {
    quoteRepo.findByPatient.mockResolvedValue([quote([item('a')])]);
    quoteRepo.findPendingQrCharges.mockResolvedValue([
      { id: 'qr-1', quoteId: 'q-1' },
    ]);

    await register(300);

    expect(planOf()).toMatchObject({ kind: 'fulfill', price: null });
  });

  it('en USD compara con el tipo de cambio del presupuesto; si cambió, usa el del día', async () => {
    patientsService.prepareToothProcedure.mockResolvedValue({
      treatment: treatment({ currency: 'USD' }),
      procedures: ROWS,
    });
    const usd = item('a', {
      subtotal: 696,
      unitPrice: 696,
      exchangeRate: 6.96,
    });
    quoteRepo.findByPatient.mockResolvedValue([quote([usd])]);

    await register(100);
    expect(planOf()).toMatchObject({ price: null });
    expect(exchangeRates.getUsdToBob).not.toHaveBeenCalled();

    planRepo.recordPerformedTreatment.mockClear();
    exchangeRates.getUsdToBob.mockResolvedValue({ rate: 7 });
    await register(110);
    expect(planOf()).toMatchObject({
      price: { subtotal: 770, exchangeRate: 7 },
    });
  });

  it('lo que no está en el plan se suma al presupuesto abierto', async () => {
    quoteRepo.findByPatient.mockResolvedValue([
      quote([item('a', { toothNumber: 34 })]),
    ]);

    await register(300);

    expect(planOf()).toEqual({
      kind: 'append',
      quoteId: 'q-1',
      line: {
        kind: 'rows',
        rows: [
          {
            treatmentId: 'conducto',
            toothNumber: 14,
            unitPrice: 300,
            quantity: 1,
            subtotal: 300,
            currency: 'BOB',
            exchangeRate: null,
          },
        ],
      },
    });
  });

  it('sin presupuesto abierto se suma a uno nuevo (quoteId null)', async () => {
    quoteRepo.findByPatient.mockResolvedValue([
      quote([item('a', { toothNumber: 34 })], { status: 'paid' }),
    ]);

    await register(300);

    expect(planOf()).toMatchObject({ kind: 'append', quoteId: null });
  });

  it('por unidad: la línea nueva guarda el unitario y la cantidad', async () => {
    patientsService.prepareToothProcedure.mockResolvedValue({
      treatment: treatment({ applicationType: 'unit' }),
      procedures: ROWS,
    });
    quoteRepo.findByPatient.mockResolvedValue([]);

    await service.registerProcedure('p-1', 'doctor-auth', {
      teeth: [],
      treatmentId: 'conducto',
      priceCharged: 60,
      quantity: 3,
    });

    expect(planOf()).toMatchObject({
      kind: 'append',
      quoteId: null,
      line: {
        kind: 'rows',
        rows: [{ toothNumber: null, unitPrice: 20, quantity: 3, subtotal: 60 }],
      },
    });
  });

  it('si otro registro cumplió la línea al mismo tiempo, 409 y no toca el odontograma', async () => {
    quoteRepo.findByPatient.mockResolvedValue([quote([item('a')])]);
    planRepo.recordPerformedTreatment.mockRejectedValue(
      new PlanLineTakenError(),
    );

    await expect(register(300)).rejects.toBeInstanceOf(ConflictException);
    expect(patientsService.recordTreatmentInOdontogram).not.toHaveBeenCalled();
  });

  it('otros errores al guardar se propagan tal cual', async () => {
    quoteRepo.findByPatient.mockResolvedValue([quote([item('a')])]);
    planRepo.recordPerformedTreatment.mockRejectedValue(new Error('db caída'));

    await expect(register(300)).rejects.toThrow('db caída');
  });
});
