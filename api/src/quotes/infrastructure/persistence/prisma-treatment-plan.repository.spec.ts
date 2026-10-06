import { Prisma } from '@prisma/client';
import { PrismaTreatmentPlanRepository } from './prisma-treatment-plan.repository';
import { PlanLineTakenError } from '../../domain/TreatmentPlanRepository';
import type { PrismaService } from '../../../shared/prisma/prisma.service';
import type { ToothProceduresToCreate } from '../../../patients/domain/PatientRepository';

const NOW = new Date('2026-10-06T12:00:00Z');

function procedureRecord(data: Record<string, unknown>) {
  return {
    id: `proc-${String(data.tooth_number)}`,
    patient_id: data.patient_id,
    tooth_number: data.tooth_number,
    application_group_id: data.application_group_id ?? null,
    treatment_id: data.treatment_id,
    price_charged: data.price_charged ?? null,
    quantity: data.quantity ?? 1,
    procedure_date: NOW,
    notes: null,
    performed_by: data.performed_by,
    quote_item_id: data.quote_item_id ?? null,
    created_at: NOW,
    tooth_procedure_surfaces: [],
    application_groups: null,
    treatments: {
      name: 'Conducto',
      application_type: 'single_tooth',
      treatment_categories: { code: 'endo', name: 'Endodoncia', color: '#000' },
    },
    users: { display_name: 'Dr. Saul' },
  };
}

function quoteRecord() {
  return {
    id: 'q-1',
    patient_id: 'p-1',
    total_amount: 300,
    total_paid: 0,
    status: 'pending',
    notes: null,
    created_at: NOW,
    updated_at: NOW,
    shared_at: NOW,
    quote_items: [],
    payments: [],
  };
}

const ROW_14: ToothProceduresToCreate = {
  kind: 'rows',
  rows: [
    {
      toothNumber: 14,
      treatmentId: 'conducto',
      priceCharged: 350,
      performedBy: 'doctor-1',
    },
  ],
};

describe('PrismaTreatmentPlanRepository (CLI-226)', () => {
  let tx: {
    tooth_procedures: { create: jest.Mock };
    application_groups: {
      create: jest.Mock;
      update: jest.Mock;
      aggregate: jest.Mock;
    };
    quote_items: {
      createManyAndReturn: jest.Mock;
      update: jest.Mock;
      aggregate: jest.Mock;
    };
    quotes: {
      create: jest.Mock;
      updateMany: jest.Mock;
      findUniqueOrThrow: jest.Mock;
      update: jest.Mock;
    };
  };
  let repo: PrismaTreatmentPlanRepository;

  beforeEach(() => {
    tx = {
      tooth_procedures: {
        create: jest.fn(({ data }: { data: Record<string, unknown> }) =>
          Promise.resolve(procedureRecord(data)),
        ),
      },
      application_groups: {
        create: jest.fn().mockResolvedValue({ id: 'proc-group' }),
        update: jest.fn(),
        aggregate: jest.fn().mockResolvedValue({ _sum: { subtotal: null } }),
      },
      quote_items: {
        createManyAndReturn: jest.fn(),
        update: jest.fn(),
        aggregate: jest.fn().mockResolvedValue({ _sum: { subtotal: 300 } }),
      },
      quotes: {
        create: jest.fn().mockResolvedValue({ id: 'q-new' }),
        updateMany: jest.fn(),
        findUniqueOrThrow: jest.fn().mockResolvedValue({ total_paid: 0 }),
        update: jest.fn().mockResolvedValue(quoteRecord()),
      },
    };
    const prisma = {
      transaction: jest.fn((fn: (t: unknown) => unknown) => fn(tx)),
    };
    repo = new PrismaTreatmentPlanRepository(
      prisma as unknown as PrismaService,
    );
  });

  it('cumplir una línea suelta: actualiza su precio y vincula el procedimiento', async () => {
    const result = await repo.recordPerformedTreatment('p-1', ROW_14, {
      kind: 'fulfill',
      quoteId: 'q-1',
      lineKey: 'item-14',
      isGroup: false,
      itemIdByTooth: new Map([[14, 'item-14']]),
      price: { unitPrice: 350, quantity: 1, subtotal: 350, exchangeRate: null },
    });

    expect(tx.quote_items.update).toHaveBeenCalledWith({
      where: { id: 'item-14', quote_id: 'q-1' },
      data: {
        unit_price: 350,
        quantity: 1,
        subtotal: 350,
        exchange_rate: null,
      },
    });
    expect(tx.tooth_procedures.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ quote_item_id: 'item-14' }) as object,
      }),
    );
    expect(result.procedures[0].quoteItemId).toBe('item-14');
    expect(tx.quotes.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'q-1' } }),
    );
  });

  it('cumplir un grupo sin cambio de precio: no toca precios y vincula cada pieza con su fila', async () => {
    await repo.recordPerformedTreatment(
      'p-1',
      {
        kind: 'group',
        group: {
          treatmentId: 'conducto',
          teeth: [{ toothNumber: 16 }, { toothNumber: 17 }],
          priceCharged: 600,
          performedBy: 'doctor-1',
        },
      },
      {
        kind: 'fulfill',
        quoteId: 'q-1',
        lineKey: 'g-1',
        isGroup: true,
        itemIdByTooth: new Map([
          [16, 'item-16'],
          [17, 'item-17'],
        ]),
        price: null,
      },
    );

    expect(tx.application_groups.update).not.toHaveBeenCalled();
    expect(tx.quote_items.update).not.toHaveBeenCalled();
    const linked = tx.tooth_procedures.create.mock.calls.map(
      ([arg]) =>
        (arg as { data: { tooth_number: number; quote_item_id: string } }).data,
    );
    expect(linked.map((d) => [d.tooth_number, d.quote_item_id])).toEqual([
      [16, 'item-16'],
      [17, 'item-17'],
    ]);
  });

  it('cumplir un grupo con otro precio actualiza el precio del grupo', async () => {
    await repo.recordPerformedTreatment(
      'p-1',
      {
        kind: 'group',
        group: {
          treatmentId: 'conducto',
          teeth: [{ toothNumber: 16 }],
          priceCharged: 700,
          performedBy: 'doctor-1',
        },
      },
      {
        kind: 'fulfill',
        quoteId: 'q-1',
        lineKey: 'g-1',
        isGroup: true,
        itemIdByTooth: new Map([[16, 'item-16']]),
        price: {
          unitPrice: 700,
          quantity: 1,
          subtotal: 700,
          exchangeRate: null,
        },
      },
    );

    expect(tx.application_groups.update).toHaveBeenCalledWith({
      where: { id: 'g-1', quote_id: 'q-1' },
      data: { unit_price: 700, subtotal: 700, exchange_rate: null },
    });
  });

  it('sumar al presupuesto abierto: lo comparte, agrega la línea y la vincula', async () => {
    tx.quote_items.createManyAndReturn.mockResolvedValue([
      { id: 'item-new', tooth_number: 14 },
    ]);

    await repo.recordPerformedTreatment('p-1', ROW_14, {
      kind: 'append',
      quoteId: 'q-1',
      line: {
        kind: 'rows',
        rows: [
          {
            treatmentId: 'conducto',
            toothNumber: 14,
            unitPrice: 350,
            quantity: 1,
            subtotal: 350,
            currency: 'BOB',
            exchangeRate: null,
          },
        ],
      },
    });

    expect(tx.quotes.updateMany).toHaveBeenCalledWith({
      where: { id: 'q-1', shared_at: null },
      data: { shared_at: expect.any(Date) as Date },
    });
    expect(tx.quotes.create).not.toHaveBeenCalled();
    expect(tx.tooth_procedures.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ quote_item_id: 'item-new' }) as object,
      }),
    );
  });

  it('sin presupuesto abierto crea uno ya compartido y suma ahí el grupo', async () => {
    tx.quote_items.createManyAndReturn.mockResolvedValue([
      { id: 'item-16', tooth_number: 16 },
      { id: 'item-17', tooth_number: 17 },
    ]);

    await repo.recordPerformedTreatment(
      'p-1',
      {
        kind: 'group',
        group: {
          treatmentId: 'conducto',
          teeth: [{ toothNumber: 16 }, { toothNumber: 17 }],
          priceCharged: 600,
          performedBy: 'doctor-1',
        },
      },
      {
        kind: 'append',
        quoteId: null,
        line: {
          kind: 'group',
          group: {
            treatmentId: 'conducto',
            toothNumbers: [16, 17],
            unitPrice: 600,
            subtotal: 600,
            currency: 'BOB',
            exchangeRate: null,
          },
        },
      },
    );

    expect(tx.quotes.create).toHaveBeenCalledWith({
      data: { patient_id: 'p-1', shared_at: expect.any(Date) as Date },
      select: { id: true },
    });
    expect(tx.application_groups.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ quote_id: 'q-new' }) as object,
      }),
    );
    expect(tx.quotes.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'q-new' } }),
    );
  });

  it('si la línea ya la cumplió otro registro (UNIQUE), PlanLineTakenError', async () => {
    tx.tooth_procedures.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('unique', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );

    await expect(
      repo.recordPerformedTreatment('p-1', ROW_14, {
        kind: 'fulfill',
        quoteId: 'q-1',
        lineKey: 'item-14',
        isGroup: false,
        itemIdByTooth: new Map([[14, 'item-14']]),
        price: null,
      }),
    ).rejects.toBeInstanceOf(PlanLineTakenError);
  });

  it('otros errores de la base se propagan', async () => {
    tx.tooth_procedures.create.mockRejectedValue(new Error('db caída'));

    await expect(
      repo.recordPerformedTreatment('p-1', ROW_14, {
        kind: 'fulfill',
        quoteId: 'q-1',
        lineKey: 'item-14',
        isGroup: false,
        itemIdByTooth: new Map([[14, 'item-14']]),
        price: null,
      }),
    ).rejects.toThrow('db caída');
  });
});
