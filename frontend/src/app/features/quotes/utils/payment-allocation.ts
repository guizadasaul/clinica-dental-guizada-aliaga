import type { Payment } from '../models/quote.model';
import type { QuoteLine } from './quote-lines';

export type LineStatus = 'paid' | 'partial' | 'pending';

export interface AllocatedLine {
  readonly line: QuoteLine;
  readonly paid: number;
  readonly pending: number;
  readonly status: LineStatus;
}

export interface Coverage {
  readonly key: string;
  readonly treatmentName: string;
  readonly amount: number;
}

export interface AllocatedPayment {
  readonly payment: Payment;
  /** A qué tratamientos se aplicó este pago, en orden. Vacío si sobró (pago por encima del total). */
  readonly covered: Coverage[];
}

export interface Allocation {
  readonly lines: AllocatedLine[];
  /** Del más reciente al más antiguo, como los ve el paciente. */
  readonly payments: AllocatedPayment[];
}

const toCents = (bs: number) => Math.round(bs * 100);
const toBs = (cents: number) => cents / 100;

function byDate(a: Payment, b: Payment): number {
  return a.paymentDate.localeCompare(b.paymentDate) || a.createdAt.localeCompare(b.createdAt);
}

/**
 * CLI-212: un pago se registra contra el presupuesto entero, no contra un
 * tratamiento. Para que el paciente vea qué pagó cada uno, los pagos se
 * reparten en orden: el más antiguo primero, cubriendo los tratamientos en el
 * orden del presupuesto (cada línea se completa antes de pasar a la
 * siguiente). Los montos se cuentan en centavos para que la suma cierre exacta.
 */
export function allocatePayments(lines: QuoteLine[], payments: Payment[]): Allocation {
  const remaining = lines.map((l) => toCents(l.total));
  const paid = lines.map(() => 0);

  const allocated = [...payments].sort(byDate).map((payment): AllocatedPayment => {
    let left = toCents(payment.amount);
    const covered: Coverage[] = [];
    for (let i = 0; i < lines.length && left > 0; i++) {
      const take = Math.min(left, remaining[i]);
      if (take > 0) {
        remaining[i] -= take;
        paid[i] += take;
        left -= take;
        covered.push({ key: lines[i].key, treatmentName: lines[i].treatmentName, amount: toBs(take) });
      }
    }
    return { payment, covered };
  });

  // Del más reciente al más antiguo para mostrarlos.
  allocated.reverse();

  return {
    lines: lines.map((line, i) => {
      let status: LineStatus = 'partial';
      if (remaining[i] === 0) {
        status = 'paid';
      } else if (paid[i] === 0) {
        status = 'pending';
      }
      return { line, paid: toBs(paid[i]), pending: toBs(remaining[i]), status };
    }),
    payments: allocated,
  };
}
