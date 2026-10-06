import type { Quote } from './Quote';
import type { QuoteItem } from './QuoteItem';
import type { TreatmentApplicationType } from '../../treatments/domain/TreatmentApplicationType';

/** Lo que el doctor acaba de registrar, para buscarlo en el presupuesto (CLI-226). */
export interface PerformedTreatment {
  treatmentId: string;
  applicationType: TreatmentApplicationType;
  toothNumbers: number[];
}

/** Una línea por realizar del presupuesto que coincide con lo registrado. */
export interface PlanLineMatch {
  quote: Quote;
  /** applicationGroupId del grupo multi-diente, o id de la fila suelta (como QuoteLine.key). */
  lineKey: string;
  /** Las filas de la línea: una por pieza en un grupo, una sola en el resto. */
  items: QuoteItem[];
}

const lineKeyOf = (item: QuoteItem) => item.applicationGroupId ?? item.id;

function sameTeeth(items: QuoteItem[], toothNumbers: number[]): boolean {
  const planned = items
    .map((i) => i.toothNumber)
    .toSorted((a, b) => (a ?? 0) - (b ?? 0));
  const performed = toothNumbers.toSorted((a, b) => a - b);
  return (
    planned.length === performed.length &&
    planned.every((tooth, i) => tooth === performed[i])
  );
}

function lineMatches(
  items: QuoteItem[],
  performed: PerformedTreatment,
): boolean {
  const [first] = items;
  if (first.treatmentId !== performed.treatmentId) {
    return false;
  }
  if (performed.applicationType === 'multiple_teeth') {
    return (
      first.applicationGroupId !== null &&
      sameTeeth(items, performed.toothNumbers)
    );
  }
  if (first.applicationGroupId !== null) {
    return false;
  }
  if (performed.applicationType === 'single_tooth') {
    return first.toothNumber === performed.toothNumbers[0];
  }
  // Arcadas, boca completa, generales y por unidad/caja: sin pieza.
  return first.toothNumber === null;
}

/**
 * La línea del presupuesto que cumple lo que se registró (CLI-226): la
 * primera por realizar del mismo tratamiento y las mismas piezas, buscando
 * en todos los presupuestos del paciente — también los pagados por
 * adelantado —, del más viejo al más nuevo. null si no está en el plan.
 *
 * - single_tooth: la misma pieza.
 * - multiple_teeth: exactamente el mismo conjunto de piezas.
 * - el resto (sin pieza): el mismo tratamiento.
 */
export function findPlanLine(
  quotes: Quote[],
  performed: PerformedTreatment,
): PlanLineMatch | null {
  const oldestFirst = quotes.toSorted(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
  );
  for (const quote of oldestFirst) {
    const lines = new Map<string, QuoteItem[]>();
    for (const item of quote.items) {
      const key = lineKeyOf(item);
      lines.set(key, [...(lines.get(key) ?? []), item]);
    }
    for (const [lineKey, items] of lines) {
      const pending = items.every((i) => i.procedureId === null);
      if (pending && lineMatches(items, performed)) {
        return { quote, lineKey, items };
      }
    }
  }
  return null;
}

/**
 * El presupuesto al que se suma lo que no estaba en el plan: el abierto
 * (pending / partially_paid) más reciente — el mismo que abre el armador de
 * presupuestos. null si no hay ninguno abierto.
 */
export function findOpenQuote(quotes: Quote[]): Quote | null {
  const open = quotes
    .filter((q) => q.status === 'pending' || q.status === 'partially_paid')
    .toSorted((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  return open[0] ?? null;
}
