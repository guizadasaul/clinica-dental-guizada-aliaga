import { computeQuoteBalance, type PaymentForBalance } from './QuoteBalance';
import type { QuoteItem } from './QuoteItem';

function item(
  id: string,
  subtotal: number,
  extra: Partial<QuoteItem> = {},
): QuoteItem {
  return {
    id,
    quoteId: 'q-1',
    treatmentId: `t-${id}`,
    treatmentName: `Tratamiento ${id}`,
    toothNumber: null,
    applicationGroupId: null,
    unitPrice: subtotal,
    quantity: 1,
    subtotal,
    currency: 'BOB',
    exchangeRate: null,
    ...extra,
  };
}

function payment(
  id: string,
  amount: number,
  date: string,
  allocations: PaymentForBalance['allocations'] = [],
  createdAt = date,
): PaymentForBalance {
  return {
    id,
    amount,
    paymentDate: new Date(date),
    createdAt: new Date(createdAt),
    allocations,
  };
}

describe('computeQuoteBalance (CLI-218)', () => {
  it('sin pagos deja todo pendiente y junta los grupos multi-diente en una línea', () => {
    const { lines, coverage } = computeQuoteBalance(
      [
        item('a', 250),
        item('b1', 800, { applicationGroupId: 'g', toothNumber: 16 }),
        item('b2', 800, { applicationGroupId: 'g', toothNumber: 17 }),
      ],
      [],
    );

    expect(lines).toEqual([
      {
        key: 'a',
        treatmentName: 'Tratamiento a',
        toothNumbers: [],
        total: 250,
        paid: 0,
        pending: 250,
      },
      {
        key: 'g',
        treatmentName: 'Tratamiento b1',
        toothNumbers: [16, 17],
        total: 800,
        paid: 0,
        pending: 800,
      },
    ]);
    expect(coverage.size).toBe(0);
  });

  it('sin asignación reparte en orden, del pago más antiguo al más nuevo', () => {
    const { lines, coverage } = computeQuoteBalance(
      [item('a', 250), item('b', 800), item('c', 1500)],
      [
        payment('p2', 1000, '2026-09-12T10:00:00Z'),
        payment('p1', 1050, '2026-08-01T10:00:00Z'),
      ],
    );

    expect(lines.map((l) => [l.key, l.paid, l.pending])).toEqual([
      ['a', 250, 0],
      ['b', 800, 0],
      ['c', 1000, 500],
    ]);
    expect(coverage.get('p1')).toEqual([
      { lineKey: 'a', treatmentName: 'Tratamiento a', amount: 250 },
      { lineKey: 'b', treatmentName: 'Tratamiento b', amount: 800 },
    ]);
    expect(coverage.get('p2')).toEqual([
      { lineKey: 'c', treatmentName: 'Tratamiento c', amount: 1000 },
    ]);
  });

  it('un pago con asignación cubre exactamente los tratamientos elegidos', () => {
    const { lines, coverage } = computeQuoteBalance(
      [item('a', 250), item('b', 800), item('c', 1500)],
      [
        payment('qr', 1750, '2026-09-01T10:00:00Z', [
          { lineKey: 'c', amount: 1500 },
          { lineKey: 'a', amount: 250 },
        ]),
      ],
    );

    expect(lines.map((l) => [l.key, l.pending])).toEqual([
      ['a', 0],
      ['b', 800],
      ['c', 0],
    ]);
    expect(coverage.get('qr')?.map((c) => [c.lineKey, c.amount])).toEqual([
      ['c', 1500],
      ['a', 250],
    ]);
  });

  it('si una línea elegida ya se cubrió antes, lo que sobra se reparte en orden', () => {
    const { lines, coverage } = computeQuoteBalance(
      [item('a', 100), item('b', 100)],
      [
        payment('cash', 100, '2026-09-01T10:00:00Z'),
        payment('qr', 100, '2026-09-02T10:00:00Z', [
          { lineKey: 'a', amount: 100 },
        ]),
      ],
    );

    expect(lines.map((l) => l.pending)).toEqual([0, 0]);
    expect(coverage.get('qr')).toEqual([
      { lineKey: 'b', treatmentName: 'Tratamiento b', amount: 100 },
    ]);
  });

  it('cierra exacto con centavos, ignora líneas que ya no existen y lo que supere el total', () => {
    const { lines, coverage } = computeQuoteBalance(
      [item('a', 100.1), item('b', 200.2)],
      [
        payment('p1', 33.33, '2026-09-01T00:00:00Z', [
          { lineKey: 'borrada', amount: 33.33 },
        ]),
        payment('p2', 66.77, '2026-09-02T00:00:00Z'),
        payment('p3', 500, '2026-09-03T00:00:00Z'),
      ],
    );

    expect(lines.map((l) => [l.paid, l.pending])).toEqual([
      [100.1, 0],
      [200.2, 0],
    ]);
    expect(coverage.get('p1')).toEqual([
      { lineKey: 'a', treatmentName: 'Tratamiento a', amount: 33.33 },
    ]);
    const p3 = coverage.get('p3')?.reduce((sum, c) => sum + c.amount, 0);
    expect(p3).toBeCloseTo(200.2, 2);
  });

  it('a igual fecha desempata por orden de registro', () => {
    const { coverage } = computeQuoteBalance(
      [item('a', 100), item('b', 100)],
      [
        payment(
          'later',
          100,
          '2026-09-01T00:00:00Z',
          [],
          '2026-09-01T12:00:00Z',
        ),
        payment(
          'first',
          100,
          '2026-09-01T00:00:00Z',
          [],
          '2026-09-01T09:00:00Z',
        ),
      ],
    );

    expect(coverage.get('first')?.[0].lineKey).toBe('a');
    expect(coverage.get('later')?.[0].lineKey).toBe('b');
  });
});
