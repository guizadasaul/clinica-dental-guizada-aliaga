import { PrismaQuotesRepository } from './prisma-quotes.repository';
import { PrismaService } from '../../../shared/prisma/prisma.service';

const NOW = new Date('2026-08-17T13:00:00.000Z');

function fakeQuoteRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: 'quote-1',
    patient_id: 'patient-1',
    total_amount: 0,
    total_paid: 0,
    status: 'pending',
    notes: null,
    created_at: NOW,
    updated_at: NOW,
    quote_items: [],
    payments: [],
    ...overrides,
  };
}

describe('PrismaQuotesRepository', () => {
  let prismaMock: {
    quotes: { create: jest.Mock; findUnique: jest.Mock; findMany: jest.Mock; update: jest.Mock };
    quote_items: {
      createMany: jest.Mock;
      findUnique: jest.Mock;
      delete: jest.Mock;
      aggregate: jest.Mock;
    };
    application_groups: {
      create: jest.Mock;
      delete: jest.Mock;
      aggregate: jest.Mock;
    };
    transaction: jest.Mock;
  };
  let repo: PrismaQuotesRepository;

  beforeEach(() => {
    prismaMock = {
      quotes: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
      },
      quote_items: {
        createMany: jest.fn(),
        findUnique: jest.fn(),
        delete: jest.fn(),
        aggregate: jest.fn(),
      },
      application_groups: {
        create: jest.fn(),
        delete: jest.fn(),
        aggregate: jest.fn(),
      },
      transaction: jest.fn((fn: (tx: unknown) => unknown) => fn(prismaMock)),
    };
    repo = new PrismaQuotesRepository(prismaMock as unknown as PrismaService);
  });

  describe('addItemGroup (CLI-45)', () => {
    it('creates the application_groups row first, then one quote_items row per tooth pointing at it', async () => {
      prismaMock.application_groups.create.mockResolvedValue({ id: 'group-1' });
      prismaMock.quote_items.aggregate.mockResolvedValue({ _sum: { subtotal: null } });
      prismaMock.application_groups.aggregate.mockResolvedValue({
        _sum: { subtotal: 1700 },
      });
      prismaMock.quotes.update.mockResolvedValue(fakeQuoteRecord());

      await repo.addItemGroup('quote-1', {
        treatmentId: 'treatment-1',
        toothNumbers: [16, 17, 18],
        unitPrice: 1700,
        subtotal: 1700,
        currency: 'BOB',
        exchangeRate: null,
      });

      expect(prismaMock.application_groups.create).toHaveBeenCalledWith({
        data: {
          quote_id: 'quote-1',
          treatment_id: 'treatment-1',
          unit_price: 1700,
          subtotal: 1700,
          currency: 'BOB',
          exchange_rate: null,
        },
      });
      expect(prismaMock.quote_items.createMany).toHaveBeenCalledWith({
        data: [16, 17, 18].map((toothNumber) => ({
          quote_id: 'quote-1',
          treatment_id: 'treatment-1',
          tooth_number: toothNumber,
          application_group_id: 'group-1',
        })),
      });
    });

    // El criterio de aceptación de CLI-45: el precio del grupo no depende de
    // que sobreviva ninguna fila puntual de quote_items — vive aparte, en
    // application_groups. Da igual cuál (o cuántas) de las filas del grupo
    // se borren, el total no cae.
    it('total_amount reflects the group subtotal regardless of how many quote_items rows remain', async () => {
      prismaMock.application_groups.create.mockResolvedValue({ id: 'group-1' });
      // Ninguna fila de quote_items tiene subtotal propio (todas NULL,
      // como corresponde para filas de un grupo) — el aggregate de Prisma
      // ignora los NULL, así que suma 0 acá.
      prismaMock.quote_items.aggregate.mockResolvedValue({ _sum: { subtotal: null } });
      prismaMock.application_groups.aggregate.mockResolvedValue({
        _sum: { subtotal: 1700 },
      });
      prismaMock.quotes.update.mockResolvedValue(fakeQuoteRecord({ total_amount: 1700 }));

      await repo.addItemGroup('quote-1', {
        treatmentId: 'treatment-1',
        toothNumbers: [16, 17, 18],
        unitPrice: 1700,
        subtotal: 1700,
        currency: 'BOB',
        exchangeRate: null,
      });

      expect(prismaMock.quotes.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ total_amount: 1700 }) as Record<
            string,
            unknown
          >,
        }),
      );
    });
  });

  describe('removeItemGroup', () => {
    it('deletes the whole application_groups row (not just the targeted quote_items row) when the item belongs to a group', async () => {
      prismaMock.quote_items.findUnique.mockResolvedValue({
        id: 'item-1',
        quote_id: 'quote-1',
        application_group_id: 'group-1',
      });
      prismaMock.application_groups.delete.mockResolvedValue({ id: 'group-1' });
      prismaMock.quote_items.aggregate.mockResolvedValue({ _sum: { subtotal: null } });
      prismaMock.application_groups.aggregate.mockResolvedValue({
        _sum: { subtotal: null },
      });
      prismaMock.quotes.update.mockResolvedValue(fakeQuoteRecord({ total_amount: 0 }));

      await repo.removeItemGroup('quote-1', 'item-1');

      expect(prismaMock.application_groups.delete).toHaveBeenCalledWith({
        where: { id: 'group-1' },
      });
      expect(prismaMock.quote_items.delete).not.toHaveBeenCalled();
    });

    it('deletes only the single quote_items row when it does not belong to a group', async () => {
      prismaMock.quote_items.findUnique.mockResolvedValue({
        id: 'item-1',
        quote_id: 'quote-1',
        application_group_id: null,
      });
      prismaMock.quote_items.delete.mockResolvedValue({ id: 'item-1' });
      prismaMock.quote_items.aggregate.mockResolvedValue({ _sum: { subtotal: null } });
      prismaMock.application_groups.aggregate.mockResolvedValue({
        _sum: { subtotal: null },
      });
      prismaMock.quotes.update.mockResolvedValue(fakeQuoteRecord());

      await repo.removeItemGroup('quote-1', 'item-1');

      expect(prismaMock.quote_items.delete).toHaveBeenCalledWith({
        where: { id: 'item-1' },
      });
      expect(prismaMock.application_groups.delete).not.toHaveBeenCalled();
    });

    it('returns null when the item does not exist or belongs to a different quote', async () => {
      prismaMock.quote_items.findUnique.mockResolvedValue(null);

      const result = await repo.removeItemGroup('quote-1', 'missing');

      expect(result).toBeNull();
      expect(prismaMock.quote_items.delete).not.toHaveBeenCalled();
      expect(prismaMock.application_groups.delete).not.toHaveBeenCalled();
    });
  });

  describe('total_amount recalculation', () => {
    it('sums loose quote_items.subtotal and application_groups.subtotal together (they never overlap)', async () => {
      prismaMock.quote_items.aggregate.mockResolvedValue({ _sum: { subtotal: 60 } });
      prismaMock.application_groups.aggregate.mockResolvedValue({
        _sum: { subtotal: 1700 },
      });
      prismaMock.quotes.update.mockResolvedValue(fakeQuoteRecord({ total_amount: 1760 }));

      await repo.addItems('quote-1', [
        {
          treatmentId: 'treatment-1',
          toothNumber: null,
          unitPrice: 20,
          quantity: 3,
          subtotal: 60,
          currency: 'BOB',
        },
      ]);

      expect(prismaMock.quotes.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ total_amount: 1760 }) as Record<
            string,
            unknown
          >,
        }),
      );
    });
  });
});
