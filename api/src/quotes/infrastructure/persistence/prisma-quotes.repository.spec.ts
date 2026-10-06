import { PrismaQuotesRepository } from './prisma-quotes.repository';
import { QuoteMapper } from './quote.mapper';
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
    quotes: {
      create: jest.Mock;
      findUnique: jest.Mock;
      findMany: jest.Mock;
      update: jest.Mock;
    };
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
      prismaMock.quote_items.aggregate.mockResolvedValue({
        _sum: { subtotal: null },
      });
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
      prismaMock.quote_items.aggregate.mockResolvedValue({
        _sum: { subtotal: null },
      });
      prismaMock.application_groups.aggregate.mockResolvedValue({
        _sum: { subtotal: 1700 },
      });
      prismaMock.quotes.update.mockResolvedValue(
        fakeQuoteRecord({ total_amount: 1700 }),
      );

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
      prismaMock.quote_items.aggregate.mockResolvedValue({
        _sum: { subtotal: null },
      });
      prismaMock.application_groups.aggregate.mockResolvedValue({
        _sum: { subtotal: null },
      });
      prismaMock.quotes.update.mockResolvedValue(
        fakeQuoteRecord({ total_amount: 0 }),
      );

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
      prismaMock.quote_items.aggregate.mockResolvedValue({
        _sum: { subtotal: null },
      });
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
      prismaMock.quote_items.aggregate.mockResolvedValue({
        _sum: { subtotal: 60 },
      });
      prismaMock.application_groups.aggregate.mockResolvedValue({
        _sum: { subtotal: 1700 },
      });
      prismaMock.quotes.update.mockResolvedValue(
        fakeQuoteRecord({ total_amount: 1760 }),
      );

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

describe('PrismaQuotesRepository — altas, lecturas y pagos', () => {
  const tx = {
    payments: { create: jest.fn(), aggregate: jest.fn() },
    quotes: { findUniqueOrThrow: jest.fn(), update: jest.fn() },
    quote_qr_charges: {
      updateMany: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      update: jest.fn(),
    },
  };
  const prisma = {
    quotes: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      updateMany: jest.fn(),
      findUniqueOrThrow: jest.fn(),
    },
    quote_qr_charges: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      updateMany: jest.fn(),
    },
    transaction: jest.fn((fn: (t: unknown) => unknown) => fn(tx)),
  };
  const repo = new PrismaQuotesRepository(prisma as unknown as PrismaService);

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(QuoteMapper, 'toDomain').mockReturnValue('mapped' as never);
    jest
      .spyOn(QuoteMapper, 'qrChargeToDomain')
      .mockReturnValue('charge' as never);
  });

  afterAll(() => jest.restoreAllMocks());

  it('createForPatient crea el presupuesto vacío con sus notas', async () => {
    prisma.quotes.create.mockResolvedValue({ id: 'quote-1' });

    await expect(repo.createForPatient('patient-1', 'plan')).resolves.toBe(
      'mapped',
    );
    expect(prisma.quotes.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { patient_id: 'patient-1', notes: 'plan' },
      }),
    );
  });

  it('findById mapea el presupuesto o devuelve null', async () => {
    prisma.quotes.findUnique
      .mockResolvedValueOnce({ id: 'quote-1' })
      .mockResolvedValueOnce(null);

    await expect(repo.findById('quote-1')).resolves.toBe('mapped');
    await expect(repo.findById('missing')).resolves.toBeNull();
  });

  it('findByPatient trae los del paciente, más nuevos primero', async () => {
    prisma.quotes.findMany.mockResolvedValue([{ id: 'q1' }, { id: 'q2' }]);

    await expect(repo.findByPatient('patient-1')).resolves.toEqual([
      'mapped',
      'mapped',
    ]);
    expect(prisma.quotes.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { patient_id: 'patient-1' },
        orderBy: { created_at: 'desc' },
      }),
    );
  });

  it('findSharedByPatient trae solo los compartidos', async () => {
    prisma.quotes.findMany.mockResolvedValue([{ id: 'q1' }]);

    await expect(repo.findSharedByPatient('patient-1')).resolves.toEqual([
      'mapped',
    ]);
    expect(prisma.quotes.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { patient_id: 'patient-1', shared_at: { not: null } },
        orderBy: { created_at: 'desc' },
      }),
    );
  });

  it('share setea shared_at solo si era null (no pisa la fecha original)', async () => {
    prisma.quotes.findUniqueOrThrow.mockResolvedValue({ id: 'quote-1' });

    await expect(repo.share('quote-1')).resolves.toBe('mapped');
    const [[args]] = prisma.quotes.updateMany.mock.calls as [
      [{ where: unknown; data: { shared_at: unknown } }],
    ];
    expect(args.where).toEqual({ id: 'quote-1', shared_at: null });
    expect(args.data.shared_at).toBeInstanceOf(Date);
  });

  describe('addPayment', () => {
    beforeEach(() => {
      tx.quotes.update.mockResolvedValue({ id: 'quote-1' });
    });

    it('registra el pago y recalcula lo pagado y el estado', async () => {
      tx.payments.aggregate.mockResolvedValue({ _sum: { amount: '300' } });
      tx.quotes.findUniqueOrThrow.mockResolvedValue({ total_amount: '300' });

      await expect(
        repo.addPayment('quote-1', {
          amount: 100,
          paymentMethod: 'qr',
          notes: 'saldo',
        }),
      ).resolves.toBe('mapped');

      expect(tx.payments.create).toHaveBeenCalledWith({
        data: {
          quote_id: 'quote-1',
          amount: 100,
          payment_method: 'qr',
          notes: 'saldo',
        },
      });
      expect(tx.quotes.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'quote-1' },
          data: expect.objectContaining({
            total_paid: 300,
            status: 'paid',
          }) as object,
        }),
      );
    });

    it('sin medio ni notas los guarda en null; sin pagos previos queda en 0', async () => {
      tx.payments.aggregate.mockResolvedValue({ _sum: { amount: null } });
      tx.quotes.findUniqueOrThrow.mockResolvedValue({ total_amount: '300' });

      await repo.addPayment('quote-1', { amount: 100 });

      expect(tx.payments.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          payment_method: null,
          notes: null,
        }) as object,
      });
      expect(tx.quotes.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            total_paid: 0,
            status: 'pending',
          }) as object,
        }),
      );
    });
  });

  describe('cobros con QR (CLI-159)', () => {
    it('createQrCharge guarda el QR generado', async () => {
      prisma.quote_qr_charges.create.mockResolvedValue({ id: 'c1' });

      await expect(
        repo.createQrCharge({
          quoteId: 'quote-1',
          amount: 150,
          qrId: 'qr-1',
          transactionId: 'tx-1',
          qrImageBase64: 'img',
        }),
      ).resolves.toBe('charge');
      expect(prisma.quote_qr_charges.create).toHaveBeenCalledWith({
        data: {
          quote_id: 'quote-1',
          amount: 150,
          baneco_qr_id: 'qr-1',
          baneco_transaction_id: 'tx-1',
          qr_image: 'img',
        },
        include: { lines: true },
      });
    });

    // CLI-218
    it('createQrCharge guarda los tratamientos que eligió el paciente', async () => {
      prisma.quote_qr_charges.create.mockResolvedValue({ id: 'c1' });

      await repo.createQrCharge({
        quoteId: 'quote-1',
        amount: 300,
        qrId: 'qr-1',
        transactionId: 'tx-1',
        qrImageBase64: 'img',
        lines: [
          { quoteItemId: 'item-1', amount: 100 },
          { applicationGroupId: 'group-1', amount: 200 },
        ],
      });

      expect(prisma.quote_qr_charges.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            lines: {
              create: [
                {
                  quote_item_id: 'item-1',
                  application_group_id: null,
                  amount: 100,
                },
                {
                  quote_item_id: null,
                  application_group_id: 'group-1',
                  amount: 200,
                },
              ],
            },
          }) as object,
        }),
      );
    });

    // CLI-220
    it('findQrChargeByQrId busca por el qrId de BANECO', async () => {
      prisma.quote_qr_charges.findUnique
        .mockResolvedValueOnce({ id: 'c1' })
        .mockResolvedValueOnce(null);

      await expect(repo.findQrChargeByQrId('qr-1')).resolves.toBe('charge');
      await expect(repo.findQrChargeByQrId('qr-x')).resolves.toBeNull();
      expect(prisma.quote_qr_charges.findUnique).toHaveBeenCalledWith({
        where: { baneco_qr_id: 'qr-1' },
        include: { lines: true },
      });
    });

    it('findPendingQrCharges trae los pendientes, el más antiguo primero', async () => {
      prisma.quote_qr_charges.findMany.mockResolvedValue([{ id: 'c1' }]);

      await expect(repo.findPendingQrCharges()).resolves.toEqual(['charge']);
      expect(prisma.quote_qr_charges.findMany).toHaveBeenCalledWith({
        where: { status: 'pending' },
        include: { lines: true },
        orderBy: { created_at: 'asc' },
      });
    });

    it('findPendingPatientQrCharge busca el QR pendiente del paciente que tenga tratamientos', async () => {
      prisma.quote_qr_charges.findFirst
        .mockResolvedValueOnce({ id: 'c1' })
        .mockResolvedValueOnce(null);

      await expect(repo.findPendingPatientQrCharge('patient-1')).resolves.toBe(
        'charge',
      );
      await expect(
        repo.findPendingPatientQrCharge('patient-1'),
      ).resolves.toBeNull();
      expect(prisma.quote_qr_charges.findFirst).toHaveBeenCalledWith({
        where: {
          status: 'pending',
          lines: { some: {} },
          quotes: { patient_id: 'patient-1' },
        },
        include: { lines: true },
        orderBy: { created_at: 'desc' },
      });
    });

    it('findQrCharge mapea el cobro o devuelve null', async () => {
      prisma.quote_qr_charges.findUnique
        .mockResolvedValueOnce({ id: 'c1' })
        .mockResolvedValueOnce(null);

      await expect(repo.findQrCharge('c1')).resolves.toBe('charge');
      await expect(repo.findQrCharge('missing')).resolves.toBeNull();
    });

    it('settleQrCharge marca pagado, crea el pago qr_baneco y recalcula', async () => {
      tx.quote_qr_charges.updateMany.mockResolvedValue({ count: 1 });
      tx.quote_qr_charges.findUniqueOrThrow.mockResolvedValue({
        quote_id: 'quote-1',
        amount: '150',
        baneco_qr_id: 'qr-1',
      });
      tx.payments.create.mockResolvedValue({ id: 'pay-1' });
      tx.payments.aggregate.mockResolvedValue({ _sum: { amount: '150' } });
      tx.quotes.findUniqueOrThrow.mockResolvedValue({ total_amount: '300' });
      tx.quotes.update.mockResolvedValue({ id: 'quote-1' });

      await expect(repo.settleQrCharge('c1')).resolves.toBe('mapped');

      expect(tx.quote_qr_charges.updateMany).toHaveBeenCalledWith({
        where: { id: 'c1', status: 'pending' },
        data: expect.objectContaining({ status: 'paid' }) as object,
      });
      expect(tx.payments.create).toHaveBeenCalledWith({
        data: {
          quote_id: 'quote-1',
          amount: '150',
          payment_method: 'qr_baneco',
          notes: 'QR BANECO qr-1',
        },
      });
      expect(tx.quote_qr_charges.update).toHaveBeenCalledWith({
        where: { id: 'c1' },
        data: { payment_id: 'pay-1' },
      });
      expect(tx.quotes.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            total_paid: 150,
            status: 'partially_paid',
          }) as object,
        }),
      );
    });

    it('settleQrCharge no hace nada si ya no estaba pendiente', async () => {
      tx.quote_qr_charges.updateMany.mockResolvedValue({ count: 0 });

      await expect(repo.settleQrCharge('c1')).resolves.toBeNull();
      expect(tx.payments.create).not.toHaveBeenCalled();
    });

    it('cancelQrCharge solo anula los pendientes', async () => {
      prisma.quote_qr_charges.updateMany
        .mockResolvedValueOnce({ count: 1 })
        .mockResolvedValueOnce({ count: 0 });

      await expect(repo.cancelQrCharge('c1')).resolves.toBe(true);
      await expect(repo.cancelQrCharge('c1')).resolves.toBe(false);
      expect(prisma.quote_qr_charges.updateMany).toHaveBeenCalledWith({
        where: { id: 'c1', status: 'pending' },
        data: expect.objectContaining({ status: 'cancelled' }) as object,
      });
    });
  });
});
