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
      status: 'partial',
      notes: null,
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
      },
    ]);
  });

  it('un ítem suelto usa su propio precio', () => {
    expect(QuoteMapper.itemToDomain(item())).toEqual({
      id: 'item-1',
      quoteId: 'quote-1',
      treatmentId: 'treatment-1',
      toothNumber: 16,
      applicationGroupId: null,
      unitPrice: 100,
      quantity: 1,
      subtotal: 100,
      currency: 'BOB',
      exchangeRate: null,
    });
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
});
