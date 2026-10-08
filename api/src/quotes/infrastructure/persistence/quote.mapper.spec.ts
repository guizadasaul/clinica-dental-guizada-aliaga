import { QuoteMapper } from './quote.mapper';

type QuoteRecord = Parameters<typeof QuoteMapper.toDomain>[0];
type ItemRecord = Parameters<typeof QuoteMapper.itemToDomain>[0];

const CREATED = new Date('2026-09-20T12:00:00Z');

function item(overrides: Partial<ItemRecord> = {}): ItemRecord {
  return {
    id: 'item-1',
    quote_id: 'quote-1',
    treatment_id: 'treatment-1',
    tooth_number: 16,
    application_group_id: null,
    unit_price: 100,
    quantity: 1,
    subtotal: 100,
    currency: 'BOB',
    exchange_rate: null,
    application_groups: null,
    treatments: { name: 'Resina' },
    ...overrides,
  } as unknown as ItemRecord;
}

describe('QuoteMapper', () => {
  it('toDomain convierte los Decimal y mapea ítems y pagos', () => {
    const quote = QuoteMapper.toDomain({
      id: 'quote-1',
      patient_id: 'patient-1',
      total_amount: '300.50',
      total_paid: '100',
      status: 'partial',
      notes: null,
      created_at: CREATED,
      updated_at: CREATED,
      quote_items: [item()],
      payments: [
        {
          id: 'pay-1',
          quote_id: 'quote-1',
          amount: '100',
          payment_method: null,
          receipt_number: 'R-0001',
          payment_date: CREATED,
          notes: null,
          created_at: CREATED,
        },
      ],
    } as unknown as QuoteRecord);

    expect(quote).toMatchObject({
      totalAmount: 300.5,
      totalPaid: 100,
      balance: 200.5,
      status: 'partial',
      notes: null,
      sharedAt: null,
    });
    expect(quote.items).toHaveLength(1);
    expect(quote.payments).toEqual([
      {
        id: 'pay-1',
        quoteId: 'quote-1',
        amount: 100,
        paymentMethod: null,
        receiptNumber: 'R-0001',
        paymentDate: CREATED,
        notes: null,
        createdAt: CREATED,
        allocations: [],
        covered: [{ lineKey: 'item-1', treatmentName: 'Resina', amount: 100 }],
      },
    ]);
    // CLI-218: lo pagado y lo pendiente por tratamiento.
    expect(quote.lines).toEqual([
      expect.objectContaining({ key: 'item-1', paid: 100 }) as object,
    ]);
  });

  it('balance nunca es negativo y sharedAt se mapea', () => {
    const quote = QuoteMapper.toDomain({
      id: 'quote-1',
      patient_id: 'patient-1',
      total_amount: '100',
      total_paid: '150',
      status: 'paid',
      notes: null,
      created_at: CREATED,
      updated_at: CREATED,
      shared_at: CREATED,
      quote_items: [],
      payments: [],
    } as unknown as QuoteRecord);

    expect(quote.balance).toBe(0);
    expect(quote.sharedAt).toBe(CREATED);
  });

  it('un ítem suelto usa su propio precio', () => {
    expect(QuoteMapper.itemToDomain(item())).toEqual({
      id: 'item-1',
      quoteId: 'quote-1',
      treatmentId: 'treatment-1',
      treatmentName: 'Resina',
      toothNumber: 16,
      applicationGroupId: null,
      unitPrice: 100,
      quantity: 1,
      subtotal: 100,
      currency: 'BOB',
      exchangeRate: null,
      procedureId: null,
      performedAt: null,
    });
  });

  // CLI-226: la fila sabe qué procedimiento la cumplió y cuándo.
  it('un ítem realizado lleva su procedimiento y la fecha', () => {
    const date = new Date('2026-04-22');
    const mapped = QuoteMapper.itemToDomain(
      item({
        tooth_procedures: [{ id: 'proc-1', procedure_date: date }],
      }),
    );

    expect(mapped).toMatchObject({ procedureId: 'proc-1', performedAt: date });
  });

  // CLI-45: el precio de un grupo vive en application_groups; todas sus
  // filas reportan ese precio, no el propio.
  it('un ítem agrupado usa el precio, moneda y tipo de cambio del grupo', () => {
    const mapped = QuoteMapper.itemToDomain(
      item({
        application_group_id: 'group-1',
        unit_price: null,
        subtotal: null,
        currency: null,
        application_groups: {
          unit_price: '250',
          subtotal: '250',
          currency: 'USD',
          exchange_rate: '6.96',
        },
      } as unknown as Partial<ItemRecord>),
    );

    expect(mapped).toMatchObject({
      applicationGroupId: 'group-1',
      unitPrice: 250,
      subtotal: 250,
      currency: 'USD',
      exchangeRate: 6.96,
    });
  });

  it('sin precio ni moneda en ningún lado: 0 y BOB', () => {
    const mapped = QuoteMapper.itemToDomain(
      item({
        unit_price: null,
        subtotal: null,
        currency: null,
      }),
    );

    expect(mapped).toMatchObject({
      unitPrice: 0,
      subtotal: 0,
      currency: 'BOB',
      exchangeRate: null,
    });
  });

  it('qrChargeToDomain convierte el monto y renombra los campos de BANECO', () => {
    expect(
      QuoteMapper.qrChargeToDomain({
        id: 'c1',
        quote_id: 'quote-1',
        amount: '150.50',
        baneco_qr_id: 'qr-1',
        baneco_transaction_id: 'tx-1',
        qr_image: 'img',
        status: 'pending',
        payment_id: null,
        created_at: CREATED,
        updated_at: CREATED,
      } as unknown as Parameters<typeof QuoteMapper.qrChargeToDomain>[0]),
    ).toEqual({
      id: 'c1',
      quoteId: 'quote-1',
      amount: 150.5,
      qrId: 'qr-1',
      transactionId: 'tx-1',
      qrImageBase64: 'img',
      status: 'pending',
      paymentId: null,
      createdAt: CREATED,
      lines: [],
    });
  });

  // CLI-218
  it('las líneas del QR se vuelven asignaciones por fila suelta o grupo', () => {
    expect(
      QuoteMapper.linesToAllocations([
        { quote_item_id: 'item-1', application_group_id: null, amount: '100' },
        {
          quote_item_id: null,
          application_group_id: 'group-1',
          amount: '50.5',
        },
      ] as unknown as Parameters<typeof QuoteMapper.linesToAllocations>[0]),
    ).toEqual([
      { lineKey: 'item-1', amount: 100 },
      { lineKey: 'group-1', amount: 50.5 },
    ]);
  });
  // CLI-257
  describe('paymentAllocations', () => {
    type PaymentRecord = Parameters<typeof QuoteMapper.paymentAllocations>[0];
    const payment = (overrides: Partial<PaymentRecord>): PaymentRecord =>
      ({ id: 'pay-1', amount: '50', ...overrides }) as unknown as PaymentRecord;

    it('el pago de una reserva web va entero a su consulta', () => {
      expect(
        QuoteMapper.paymentAllocations(
          payment({
            quote_item: { id: 'item-9', application_group_id: null },
          }),
        ),
      ).toEqual([{ lineKey: 'item-9', amount: 50 }]);
    });

    it('si la línea es de un grupo, la clave es la del grupo', () => {
      expect(
        QuoteMapper.paymentAllocations(
          payment({
            quote_item: { id: 'item-9', application_group_id: 'group-2' },
          }),
        ),
      ).toEqual([{ lineKey: 'group-2', amount: 50 }]);
    });

    it('las líneas del QR mandan sobre la línea del pago', () => {
      expect(
        QuoteMapper.paymentAllocations(
          payment({
            qr_charge: {
              lines: [
                {
                  quote_item_id: 'item-1',
                  application_group_id: null,
                  amount: '20',
                },
              ],
            },
            quote_item: { id: 'item-9', application_group_id: null },
          } as unknown as Partial<PaymentRecord>),
        ),
      ).toEqual([{ lineKey: 'item-1', amount: 20 }]);
    });

    it('sin QR ni línea: sin asignaciones (reparto FIFO)', () => {
      expect(
        QuoteMapper.paymentAllocations(
          payment({ qr_charge: { lines: [] }, quote_item: null }),
        ),
      ).toEqual([]);
    });
  });
});
