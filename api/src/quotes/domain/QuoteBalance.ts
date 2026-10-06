import type { QuoteItem } from './QuoteItem';

/** Asignación explícita de un pago a una línea (CLI-218): QR que generó el paciente eligiendo tratamientos. */
export interface PaymentAllocation {
  /** applicationGroupId del grupo multi-diente, o id de la fila suelta. */
  lineKey: string;
  amount: number;
}

/** Lo que necesita el reparto de cada pago. */
export interface PaymentForBalance {
  id: string;
  amount: number;
  paymentDate: Date;
  createdAt: Date;
  allocations: PaymentAllocation[];
}

/** Un tratamiento del presupuesto como lo ve el paciente, con lo pagado y lo pendiente. */
export interface QuoteLine {
  /** applicationGroupId del grupo multi-diente, o id de la fila suelta. */
  key: string;
  treatmentName: string;
  toothNumbers: number[];
  total: number;
  paid: number;
  pending: number;
}

export interface PaymentCoverage {
  lineKey: string;
  treatmentName: string;
  amount: number;
}

export interface QuoteBalance {
  lines: QuoteLine[];
  /** paymentId → a qué tratamientos se aplicó, en orden. */
  coverage: Map<string, PaymentCoverage[]>;
}

const toCents = (bs: number) => Math.round(bs * 100);
const toBs = (cents: number) => cents / 100;

/**
 * Agrupa las filas de un mismo grupo multi-diente (applicationGroupId) en una
 * sola línea: todas reportan el subtotal del grupo (CLI-45), así que se toma
 * el de la primera. Mismo criterio que groupQuoteLines del frontend.
 */
function groupLines(items: QuoteItem[]): Omit<QuoteLine, 'paid' | 'pending'>[] {
  const groups = new Map<string, QuoteItem[]>();
  for (const item of items) {
    const key = item.applicationGroupId ?? item.id;
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return [...groups.entries()].map(([key, rows]) => ({
    key,
    treatmentName: rows[0].treatmentName,
    toothNumbers: rows
      .map((r) => r.toothNumber)
      .filter((n): n is number => n !== null),
    total: rows[0].subtotal,
  }));
}

function byDate(a: PaymentForBalance, b: PaymentForBalance): number {
  return (
    a.paymentDate.getTime() - b.paymentDate.getTime() ||
    a.createdAt.getTime() - b.createdAt.getTime()
  );
}

/**
 * Cuánto se pagó de cada tratamiento (CLI-212, en el backend desde CLI-218).
 * Los pagos se recorren por fecha, el más antiguo primero:
 * - uno con asignación explícita cubre esas líneas (hasta lo que les falte);
 * - el resto, o lo que sobre de uno explícito, se reparte en el orden del
 *   presupuesto, completando cada línea antes de pasar a la siguiente.
 * Los montos se cuentan en centavos para que la suma cierre exacta. Lo que
 * supere el total del presupuesto no se asigna a nada.
 */
export function computeQuoteBalance(
  items: QuoteItem[],
  payments: PaymentForBalance[],
): QuoteBalance {
  const lines = groupLines(items);
  const remaining = new Map(lines.map((l) => [l.key, toCents(l.total)]));
  const paid = new Map(lines.map((l) => [l.key, 0]));
  const names = new Map(lines.map((l) => [l.key, l.treatmentName]));
  const coverage = new Map<string, PaymentCoverage[]>();

  for (const payment of payments.toSorted(byDate)) {
    let left = toCents(payment.amount);
    const covered: PaymentCoverage[] = [];
    const take = (key: string, wanted: number) => {
      const amount = Math.min(wanted, left, remaining.get(key) ?? 0);
      if (amount <= 0) {
        return;
      }
      remaining.set(key, (remaining.get(key) ?? 0) - amount);
      paid.set(key, (paid.get(key) ?? 0) + amount);
      left -= amount;
      const previous = covered.find((c) => c.lineKey === key);
      if (previous) {
        previous.amount += toBs(amount);
      } else {
        covered.push({
          lineKey: key,
          treatmentName: names.get(key) ?? '',
          amount: toBs(amount),
        });
      }
    };

    for (const allocation of payment.allocations) {
      take(allocation.lineKey, toCents(allocation.amount));
    }
    for (const line of lines) {
      take(line.key, left);
    }
    coverage.set(payment.id, covered);
  }

  return {
    lines: lines.map((l) => ({
      ...l,
      paid: toBs(paid.get(l.key) ?? 0),
      pending: toBs(remaining.get(l.key) ?? 0),
    })),
    coverage,
  };
}
