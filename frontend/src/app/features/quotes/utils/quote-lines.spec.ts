import { groupQuoteLines, linePerformedAt, paymentMethodLabel } from './quote-lines';
import type { QuoteItem } from '../models/quote.model';

function item(overrides: Partial<QuoteItem> = {}): QuoteItem {
  return {
    id: 'item-1',
    quoteId: 'quote-1',
    treatmentId: 'treatment-1',
    treatmentName: 'Resina',
    toothNumber: 16,
    applicationGroupId: null,
    unitPrice: 150,
    quantity: 1,
    subtotal: 150,
    currency: 'BOB',
    exchangeRate: null,
    procedureId: null,
    performedAt: null,
    ...overrides,
  };
}

describe('groupQuoteLines', () => {
  it('junta las filas de un mismo grupo en una línea con todas sus piezas', () => {
    const lines = groupQuoteLines([
      item({ id: 'a', applicationGroupId: 'g1', toothNumber: 16, subtotal: 300 }),
      item({ id: 'b', applicationGroupId: 'g1', toothNumber: 17, subtotal: 300 }),
      item({ id: 'c', treatmentName: 'Limpieza', toothNumber: null, subtotal: 250 }),
    ]);

    expect(lines).toEqual([
      { key: 'g1', treatmentName: 'Resina', toothNumbers: [16, 17], total: 300, performedAt: null },
      { key: 'c', treatmentName: 'Limpieza', toothNumbers: [], total: 250, performedAt: null },
    ]);
  });
});

describe('linePerformedAt (CLI-228)', () => {
  const done = (date: string) => item({ procedureId: `p-${date}`, performedAt: date });

  it('la fecha más reciente si todas las filas se realizaron', () => {
    expect(linePerformedAt([done('2026-05-01'), done('2026-05-03'), done('2026-04-20')])).toBe('2026-05-03');
  });

  it('null si falta alguna', () => {
    expect(linePerformedAt([done('2026-05-01'), item()])).toBeNull();
  });
});

describe('paymentMethodLabel', () => {
  it.each([
    ['cash', 'Efectivo'],
    ['qr_baneco', 'QR BANECO'],
    ['transferencia', 'transferencia'],
    [null, '—'],
  ])('%s → %s', (method, label) => {
    expect(paymentMethodLabel(method)).toBe(label);
  });
});
