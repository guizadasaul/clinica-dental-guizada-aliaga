import type { Quote } from './Quote';
import type {
  NewQuoteItemData,
  NewQuoteItemGroupData,
} from './QuoteRepository';
import type { ToothProcedure } from '../../patients/domain/ToothProcedure';
import type { ToothProceduresToCreate } from '../../patients/domain/PatientRepository';

/** Nuevo precio de una línea del presupuesto (ya en Bs). */
export interface LinePriceUpdate {
  unitPrice: number;
  quantity: number;
  subtotal: number;
  exchangeRate: number | null;
}

/**
 * Qué le pasa al presupuesto (CLI-226):
 * - `fulfill`: lo registrado cumple una línea; sus filas quedan vinculadas y,
 *   si el doctor cobró otro precio, la línea toma ese precio.
 * - `append`: no estaba en el plan; se suma una línea, ya vinculada, al
 *   presupuesto abierto (o a uno nuevo si quoteId es null), que queda
 *   compartido.
 */
export type PlanEffect =
  | {
      kind: 'fulfill';
      quoteId: string;
      /** applicationGroupId del grupo, o id de la fila suelta. */
      lineKey: string;
      isGroup: boolean;
      /** Fila del presupuesto por pieza (null = sin pieza). */
      itemIdByTooth: Map<number | null, string>;
      price: LinePriceUpdate | null;
    }
  | {
      kind: 'append';
      quoteId: string | null;
      line:
        | { kind: 'rows'; rows: NewQuoteItemData[] }
        | { kind: 'group'; group: NewQuoteItemGroupData };
    };

export interface RecordPerformedTreatmentResult {
  procedures: ToothProcedure[];
  quote: Quote;
}

export interface ITreatmentPlanRepository {
  /**
   * En una sola transacción: crea los procedimientos, vincula o suma la
   * línea del presupuesto y recalcula total y estado. Si algo falla, no
   * queda nada registrado.
   */
  recordPerformedTreatment(
    patientId: string,
    procedures: ToothProceduresToCreate,
    plan: PlanEffect,
  ): Promise<RecordPerformedTreatmentResult>;
}

export const TreatmentPlanRepository = Symbol('ITreatmentPlanRepository');

/** Otro registro cumplió la misma línea del presupuesto al mismo tiempo. */
export class PlanLineTakenError extends Error {
  constructor() {
    super(
      'Esa línea del presupuesto se acaba de registrar. Vuelve a intentarlo.',
    );
    this.name = 'PlanLineTakenError';
  }
}
