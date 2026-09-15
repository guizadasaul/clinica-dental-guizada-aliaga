import type { Quote } from './Quote';

export interface NewQuoteItemData {
  treatmentId: string;
  toothNumber: number | null;
  applicationGroupId?: string | null;
  unitPrice: number;
  quantity: number;
  subtotal: number;
  currency: string;
  exchangeRate?: number | null;
}

export interface NewPaymentData {
  amount: number;
  paymentMethod?: string | null;
  notes?: string | null;
}

export interface IQuoteRepository {
  createForPatient(patientId: string, notes: string | null): Promise<Quote>;
  findById(id: string): Promise<Quote | null>;
  /** Con sus líneas, más recientes primero. */
  findByPatient(patientId: string): Promise<Quote[]>;
  /** Inserta las filas y recalcula total_amount en la misma transacción. */
  addItems(quoteId: string, items: NewQuoteItemData[]): Promise<Quote>;
  /**
   * Borra la fila, o si tiene applicationGroupId el grupo entero (una
   * aplicación multi_tooth se cobra/borra como una unidad), y recalcula
   * total_amount. null si itemId no existe.
   */
  removeItemGroup(quoteId: string, itemId: string): Promise<Quote | null>;
  /** Inserta el pago y recalcula total_paid + status en la misma transacción. */
  addPayment(quoteId: string, data: NewPaymentData): Promise<Quote>;
}

export const QuoteRepository = Symbol('IQuoteRepository');
