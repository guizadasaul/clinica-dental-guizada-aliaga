import { allocatePayments } from './payment-allocation';
import type { QuoteLine } from './quote-lines';
import type { Payment } from '../models/quote.model';

const line = (key: string, total: number): QuoteLine => ({
  key,
  treatmentName: `Tratamiento ${key}`,
  toothNumbers: [],
  total,
});

const payment = (id: string, amount: number, paymentDate: string, createdAt = paymentDate): Payment => ({
  id,
  quoteId: 'q-1',
  amount,
  paymentMethod: 'cash',
  receiptNumber: `REC-${id}`,
  paymentDate,
  notes: null,
  createdAt,
});

describe('allocatePayments (CLI-212)', () => {
  it('sin pagos deja todo pendiente', () => {
    const result = allocatePayments([line('a', 250), line('b', 800)], []);

    expect(result.lines.map((l) => [l.status, l.paid, l.pending])).toEqual([
      ['pending', 0, 250],
      ['pending', 0, 800],
    ]);
    expect(result.payments).toEqual([]);
  });

  it('reparte del pago más antiguo al tratamiento que sigue, en el orden del presupuesto', () => {
    const result = allocatePayments(
      [line('a', 250), line('b', 800), line('c', 1500)],
      [payment('2', 1000, '2026-09-12T10:00:00Z'), payment('1', 1050, '2026-08-01T10:00:00Z')],
    );

    expect(result.lines.map((l) => [l.line.key, l.status, l.paid, l.pending])).toEqual([
      ['a', 'paid', 250, 0],
      ['b', 'paid', 800, 0],
      ['c', 'partial', 1000, 500],
    ]);
    // Más reciente primero; el primer pago cubrió dos tratamientos.
    expect(result.payments.map((p) => p.payment.id)).toEqual(['2', '1']);
    expect(result.payments[1].covered).toEqual([
      { key: 'a', treatmentName: 'Tratamiento a', amount: 250 },
      { key: 'b', treatmentName: 'Tratamiento b', amount: 800 },
    ]);
    expect(result.payments[0].covered).toEqual([{ key: 'c', treatmentName: 'Tratamiento c', amount: 1000 }]);
  });

  it('lo asignado suma exactamente lo pagado, incluso con centavos', () => {
    const result = allocatePayments(
      [line('a', 100.1), line('b', 200.2)],
      [payment('1', 33.33, '2026-09-01T00:00:00Z'), payment('2', 66.77, '2026-09-02T00:00:00Z'), payment('3', 0.1, '2026-09-03T00:00:00Z')],
    );
    const assigned = result.payments.flatMap((p) => p.covered).reduce((sum, c) => sum + Math.round(c.amount * 100), 0);

    expect(assigned).toBe(Math.round((33.33 + 66.77 + 0.1) * 100));
    expect(result.lines[0]).toMatchObject({ status: 'paid', paid: 100.1, pending: 0 });
    expect(result.lines[1]).toMatchObject({ status: 'partial', paid: 0.1, pending: 200.1 });
  });

  it('el sobrante de un pago por encima del total no se asigna a nada', () => {
    const result = allocatePayments([line('a', 100)], [payment('1', 150, '2026-09-01T00:00:00Z')]);

    expect(result.lines[0]).toMatchObject({ status: 'paid', paid: 100, pending: 0 });
    expect(result.payments[0].covered).toEqual([{ key: 'a', treatmentName: 'Tratamiento a', amount: 100 }]);
  });

  it('a igual fecha desempata por orden de registro', () => {
    const result = allocatePayments(
      [line('a', 100), line('b', 100)],
      [
        payment('later', 100, '2026-09-01T00:00:00Z', '2026-09-01T12:00:00Z'),
        payment('first', 100, '2026-09-01T00:00:00Z', '2026-09-01T09:00:00Z'),
      ],
    );

    expect(result.payments.find((p) => p.payment.id === 'first')?.covered[0].key).toBe('a');
    expect(result.payments.find((p) => p.payment.id === 'later')?.covered[0].key).toBe('b');
  });

  it('un tratamiento en 0 queda como pagado y no recibe dinero', () => {
    const result = allocatePayments([line('free', 0), line('a', 50)], [payment('1', 50, '2026-09-01T00:00:00Z')]);

    expect(result.lines[0]).toMatchObject({ status: 'paid', paid: 0 });
    expect(result.payments[0].covered.map((c) => c.key)).toEqual(['a']);
  });
});
