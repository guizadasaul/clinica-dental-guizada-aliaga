import { matchPlanLine, pendingPlanLines, planLinePrice, type PlanLine } from './treatment-plan';
import type { Quote, QuoteItem } from '../models/quote.model';

function item(id: string, overrides: Partial<QuoteItem> = {}): QuoteItem {
  return {
    id,
    quoteId: 'q',
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
    ...overrides,
  };
}

function quote(id: string, createdAt: string, items: QuoteItem[]): Quote {
  return {
    id,
    patientId: 'p',
    totalAmount: 0,
    totalPaid: 0,
    balance: 0,
    status: 'pending',
    notes: null,
    createdAt,
    updatedAt: createdAt,
    sharedAt: createdAt,
    items,
    payments: [],
    lines: [],
  };
}

describe('pendingPlanLines (CLI-228)', () => {
  it('lo que falta realizar, del presupuesto más viejo al más nuevo, con los grupos juntos', () => {
    const lines = pendingPlanLines([
      quote('nuevo', '2026-06-01', [item('n', { toothNumber: 11 })]),
      quote('viejo', '2026-01-01', [
        item('hecho', { procedureId: 'p1', performedAt: '2026-02-01' }),
        item('g17', { applicationGroupId: 'g', toothNumber: 17, subtotal: 600 }),
        item('g16', { applicationGroupId: 'g', toothNumber: 16, subtotal: 600 }),
      ]),
    ]);

    expect(lines.map((l) => [l.quoteId, l.key, l.toothNumbers, l.isGroup, l.total])).toEqual([
      ['viejo', 'g', [16, 17], true, 600],
      ['nuevo', 'n', [11], false, 300],
    ]);
  });
});

describe('matchPlanLine (CLI-228)', () => {
  const line = (overrides: Partial<PlanLine>): PlanLine => ({
    key: 'k',
    quoteId: 'q',
    treatmentId: 'conducto',
    treatmentName: 'Conducto',
    toothNumbers: [14],
    isGroup: false,
    quantity: 1,
    total: 300,
    exchangeRate: null,
    ...overrides,
  });

  it('single_tooth: misma pieza y mismo tratamiento', () => {
    const lines = [line({ key: 'a', toothNumbers: [34] }), line({ key: 'b' })];
    expect(matchPlanLine(lines, 'conducto', 'single_tooth', [14])?.key).toBe('b');
    expect(matchPlanLine(lines, 'corona', 'single_tooth', [14])).toBeNull();
  });

  it('multiple_teeth: el mismo conjunto de piezas, en cualquier orden', () => {
    const lines = [line({ key: 'g', toothNumbers: [16, 17], isGroup: true })];
    expect(matchPlanLine(lines, 'conducto', 'multiple_teeth', [17, 16])?.key).toBe('g');
    expect(matchPlanLine(lines, 'conducto', 'multiple_teeth', [16])).toBeNull();
  });

  it('sin pieza: el mismo tratamiento, sin grupo', () => {
    const lines = [line({ key: 'g', toothNumbers: [11], isGroup: true }), line({ key: 'l', toothNumbers: [] })];
    expect(matchPlanLine(lines, 'conducto', 'full_mouth', [])?.key).toBe('l');
  });
});

describe('planLinePrice', () => {
  it('en Bs tal cual; en USD con el tipo de cambio con que se presupuestó', () => {
    const base: PlanLine = {
      key: 'k', quoteId: 'q', treatmentId: 't', treatmentName: 'T', toothNumbers: [],
      isGroup: false, quantity: 1, total: 696, exchangeRate: 6.96,
    };
    expect(planLinePrice(base, 'BOB')).toBe(696);
    expect(planLinePrice(base, 'USD')).toBe(100);
  });
});
