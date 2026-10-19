import { UnprocessableEntityException } from '@nestjs/common';
import type { Quote } from '../domain/Quote';
import type { NewQrChargeLineData } from '../domain/QuoteRepository';
import { round2 } from './quote-pricing';

export interface ChargedLines {
  lines: NewQrChargeLineData[];
  /** Suma del saldo completo de cada tratamiento elegido. */
  amount: number;
}

/**
 * Los tratamientos (claves de línea del presupuesto) que se cobran, cada uno
 * por su saldo completo: lo usan el QR del paciente (CLI-218) y el efectivo y
 * el QR del doctor (CLI-261). 422 si alguno no es de este presupuesto o ya
 * está pagado.
 */
export function chargedLines(quote: Quote, lineKeys: string[]): ChargedLines {
  const selected = [...new Set(lineKeys)].map((key) =>
    quote.lines.find((l) => l.key === key),
  );
  if (selected.some((line) => !line)) {
    throw new UnprocessableEntityException(
      'Alguno de los tratamientos elegidos no está en este presupuesto',
    );
  }
  const lines = selected.filter((l) => l !== undefined);
  if (lines.some((l) => l.pending <= 0)) {
    throw new UnprocessableEntityException(
      'Alguno de los tratamientos elegidos ya está pagado',
    );
  }

  const groupIds = new Set(
    quote.items.map((i) => i.applicationGroupId).filter(Boolean),
  );
  return {
    lines: lines.map((l) =>
      groupIds.has(l.key)
        ? { applicationGroupId: l.key, amount: l.pending }
        : { quoteItemId: l.key, amount: l.pending },
    ),
    amount: round2(lines.reduce((sum, l) => sum + l.pending, 0)),
  };
}
