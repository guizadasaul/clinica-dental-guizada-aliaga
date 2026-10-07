import type { Quote } from '../models/quote.model';
import type { TreatmentApplicationType } from '../../treatments/models/treatment.model';

/**
 * Una línea del presupuesto que el doctor todavía tiene que realizar
 * (CLI-228): el plan que le propuso al paciente.
 */
export interface PlanLine {
  /** applicationGroupId del grupo multi-diente, o id de la fila suelta. */
  readonly key: string;
  readonly quoteId: string;
  readonly treatmentId: string;
  readonly treatmentName: string;
  readonly toothNumbers: number[];
  readonly isGroup: boolean;
  readonly quantity: number;
  /** Siempre en Bs. */
  readonly total: number;
  /** Tipo de cambio con que se presupuestó, si el tratamiento cotiza en USD. */
  readonly exchangeRate: number | null;
}

/**
 * Lo que falta realizar de los presupuestos del paciente, del presupuesto
 * más viejo al más nuevo — el mismo orden en que el backend busca la línea
 * que cumple un tratamiento registrado (findPlanLine, CLI-226).
 */
export function pendingPlanLines(quotes: readonly Quote[]): PlanLine[] {
  const oldestFirst = [...quotes].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return oldestFirst.flatMap((quote) => {
    const byKey = new Map<string, Quote['items']>();
    for (const item of quote.items) {
      const key = item.applicationGroupId ?? item.id;
      byKey.set(key, [...(byKey.get(key) ?? []), item]);
    }
    return [...byKey.entries()]
      .filter(([, rows]) => rows.every((r) => r.procedureId === null))
      .map(([key, rows]) => ({
        key,
        quoteId: quote.id,
        treatmentId: rows[0].treatmentId,
        treatmentName: rows[0].treatmentName,
        toothNumbers: rows
          .map((r) => r.toothNumber)
          .filter((n): n is number => n !== null)
          .sort((a, b) => a - b),
        isGroup: rows[0].applicationGroupId !== null,
        quantity: rows[0].quantity,
        total: rows[0].subtotal,
        exchangeRate: rows[0].exchangeRate,
      }));
  });
}

/**
 * La línea por realizar que cumpliría lo que el doctor está por registrar —
 * mismas reglas que el backend: single_tooth la misma pieza, multiple_teeth
 * el mismo conjunto de piezas, el resto (sin pieza) el mismo tratamiento.
 */
export function matchPlanLine(
  lines: readonly PlanLine[],
  treatmentId: string,
  applicationType: TreatmentApplicationType,
  toothNumbers: readonly number[],
): PlanLine | null {
  const teeth = [...toothNumbers].sort((a, b) => a - b);
  return (
    lines.find((line) => {
      if (line.treatmentId !== treatmentId) { return false; }
      if (applicationType === 'multiple_teeth') {
        return line.isGroup && line.toothNumbers.length === teeth.length
          && line.toothNumbers.every((n, i) => n === teeth[i]);
      }
      if (line.isGroup) { return false; }
      if (applicationType === 'single_tooth') {
        return line.toothNumbers[0] === teeth[0];
      }
      return line.toothNumbers.length === 0;
    }) ?? null
  );
}

/** El precio de la línea en la moneda del tratamiento (el panel de registro cobra en esa moneda). */
export function planLinePrice(line: PlanLine, currency: string): number {
  if (currency === 'USD' && line.exchangeRate) {
    return Math.round((line.total / line.exchangeRate) * 100) / 100;
  }
  return line.total;
}
