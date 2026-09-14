import type { Quote } from './Quote';

export interface NewQuoteItemData {
  treatmentId: string;
  toothNumber: number | null;
  unitPrice: number;
  quantity: number;
  subtotal: number;
  currency: string;
  exchangeRate?: number | null;
}

/**
 * Una aplicación multiple_teeth: un precio (a nivel de grupo, CLI-45) y una
 * fila de quote_items por diente colgando de él, sin precio propio.
 */
export interface NewQuoteItemGroupData {
  treatmentId: string;
  toothNumbers: number[];
  unitPrice: number;
  subtotal: number;
  currency: string;
  exchangeRate?: number | null;
}

export interface IQuoteRepository {
  createForPatient(patientId: string, notes: string | null): Promise<Quote>;
  findById(id: string): Promise<Quote | null>;
  /** Con sus líneas, más recientes primero. */
  findByPatient(patientId: string): Promise<Quote[]>;
  /** Inserta filas sueltas (single_tooth/general, cada una con su propio precio) y recalcula total_amount. */
  addItems(quoteId: string, items: NewQuoteItemData[]): Promise<Quote>;
  /** Crea el application_groups (precio del grupo) + una fila de quote_items por diente, sin precio propio, y recalcula total_amount. */
  addItemGroup(quoteId: string, data: NewQuoteItemGroupData): Promise<Quote>;
  /**
   * Borra la fila suelta, o si tiene applicationGroupId borra el
   * application_groups entero (una aplicación multi_tooth se cobra/borra
   * como una unidad — sus quote_items caen por ON DELETE CASCADE), y
   * recalcula total_amount. null si itemId no existe.
   */
  removeItemGroup(quoteId: string, itemId: string): Promise<Quote | null>;
}

export const QuoteRepository = Symbol('IQuoteRepository');
