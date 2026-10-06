import { findOpenQuote, findPlanLine } from './QuotePlanMatching';
import type { Quote } from './Quote';
import type { QuoteItem } from './QuoteItem';

function item(id: string, extra: Partial<QuoteItem> = {}): QuoteItem {
  return {
    id,
    quoteId: 'q-1',
    treatmentId: 'conducto',
    treatmentName: 'Conducto',
    toothNumber: null,
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

function quote(
  id: string,
  items: QuoteItem[],
  extra: Partial<Quote> = {},
): Quote {
  return {
    id,
    patientId: 'p-1',
    totalAmount: 0,
    totalPaid: 0,
    balance: 0,
    status: 'pending',
    notes: null,
    createdAt: new Date('2026-02-25'),
    updatedAt: new Date('2026-02-25'),
    sharedAt: new Date('2026-02-25'),
    items: items.map((i) => ({ ...i, quoteId: id })),
    payments: [],
    lines: [],
    ...extra,
  };
}

const done = { procedureId: 'proc-x', performedAt: new Date('2026-04-01') };

describe('findPlanLine (CLI-226)', () => {
  it('single_tooth: la línea por realizar del mismo tratamiento y la misma pieza', () => {
    const quotes = [
      quote('q-1', [
        item('a', { toothNumber: 34 }),
        item('b', { toothNumber: 14 }),
      ]),
    ];

    const match = findPlanLine(quotes, {
      treatmentId: 'conducto',
      applicationType: 'single_tooth',
      toothNumbers: [14],
    });

    expect(match?.lineKey).toBe('b');
    expect(match?.items.map((i) => i.id)).toEqual(['b']);
  });

  it('una línea ya realizada no se vuelve a cumplir', () => {
    const quotes = [quote('q-1', [item('a', { toothNumber: 14, ...done })])];

    expect(
      findPlanLine(quotes, {
        treatmentId: 'conducto',
        applicationType: 'single_tooth',
        toothNumbers: [14],
      }),
    ).toBeNull();
  });

  it('otro tratamiento u otra pieza no coincide', () => {
    const quotes = [quote('q-1', [item('a', { toothNumber: 14 })])];

    expect(
      findPlanLine(quotes, {
        treatmentId: 'corona',
        applicationType: 'single_tooth',
        toothNumbers: [14],
      }),
    ).toBeNull();
    expect(
      findPlanLine(quotes, {
        treatmentId: 'conducto',
        applicationType: 'single_tooth',
        toothNumbers: [15],
      }),
    ).toBeNull();
  });

  it('multiple_teeth: exactamente el mismo conjunto de piezas, en cualquier orden', () => {
    const group = (id: string, tooth: number) =>
      item(id, { applicationGroupId: 'g-1', toothNumber: tooth });
    const quotes = [quote('q-1', [group('a', 16), group('b', 17)])];
    const performed = (teeth: number[]) =>
      findPlanLine(quotes, {
        treatmentId: 'conducto',
        applicationType: 'multiple_teeth',
        toothNumbers: teeth,
      });

    expect(performed([17, 16])?.lineKey).toBe('g-1');
    expect(performed([16])).toBeNull();
    expect(performed([16, 17, 18])).toBeNull();
  });

  it('un grupo con una sola pieza realizada ya no está por realizar', () => {
    const quotes = [
      quote('q-1', [
        item('a', { applicationGroupId: 'g-1', toothNumber: 16, ...done }),
        item('b', { applicationGroupId: 'g-1', toothNumber: 17 }),
      ]),
    ];

    expect(
      findPlanLine(quotes, {
        treatmentId: 'conducto',
        applicationType: 'multiple_teeth',
        toothNumbers: [16, 17],
      }),
    ).toBeNull();
  });

  it('sin pieza (arcada, boca completa, general): el mismo tratamiento, sin grupo', () => {
    const quotes = [
      quote('q-1', [
        item('grupo', { applicationGroupId: 'g-1', toothNumber: 11 }),
        item('limpieza'),
      ]),
    ];

    expect(
      findPlanLine(quotes, {
        treatmentId: 'conducto',
        applicationType: 'full_mouth',
        toothNumbers: [],
      })?.lineKey,
    ).toBe('limpieza');
  });

  it('busca del presupuesto más viejo al más nuevo, también en los pagados', () => {
    const quotes = [
      quote('nuevo', [item('n', { toothNumber: 14 })], {
        createdAt: new Date('2026-06-01'),
      }),
      quote('viejo', [item('v', { toothNumber: 14 })], {
        createdAt: new Date('2026-01-01'),
        status: 'paid',
      }),
    ];

    expect(
      findPlanLine(quotes, {
        treatmentId: 'conducto',
        applicationType: 'single_tooth',
        toothNumbers: [14],
      })?.quote.id,
    ).toBe('viejo');
  });
});

describe('findOpenQuote (CLI-226)', () => {
  it('el pendiente o pagado en parte más reciente; null si no hay', () => {
    const quotes = [
      quote('pagado', [], {
        status: 'paid',
        createdAt: new Date('2026-07-01'),
      }),
      quote('abierto-viejo', [], { createdAt: new Date('2026-01-01') }),
      quote('abierto-nuevo', [], {
        status: 'partially_paid',
        createdAt: new Date('2026-05-01'),
      }),
    ];

    expect(findOpenQuote(quotes)?.id).toBe('abierto-nuevo');
    expect(findOpenQuote([quotes[0]])).toBeNull();
  });
});
