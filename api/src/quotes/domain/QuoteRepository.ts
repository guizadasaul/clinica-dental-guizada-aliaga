import type { Quote } from './Quote';
import type { QrCharge } from './QrCharge';

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

export interface NewPaymentData {
  amount: number;
  paymentMethod?: string | null;
  notes?: string | null;
}

/** CLI-218: un tratamiento que cubre el QR — fila suelta o grupo multi-diente, nunca las dos. */
export interface NewQrChargeLineData {
  quoteItemId?: string;
  applicationGroupId?: string;
  amount: number;
}

export interface NewQrChargeData {
  quoteId: string;
  amount: number;
  qrId: string;
  transactionId: string;
  qrImageBase64: string;
  /** CLI-218: solo en los QR que genera el paciente eligiendo tratamientos. */
  lines?: NewQrChargeLineData[];
}

export interface IQuoteRepository {
  createForPatient(patientId: string, notes: string | null): Promise<Quote>;
  findById(id: string): Promise<Quote | null>;
  /** Con sus líneas, más recientes primero. */
  findByPatient(patientId: string): Promise<Quote[]>;
  /** Solo los compartidos (shared_at NOT NULL) — lo único que ve el paciente. */
  findSharedByPatient(patientId: string): Promise<Quote[]>;
  /** Setea shared_at si todavía era NULL (idempotente: no pisa la fecha original). */
  share(quoteId: string): Promise<Quote>;
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
  /** Inserta el pago y recalcula total_paid + status en la misma transacción. */
  addPayment(quoteId: string, data: NewPaymentData): Promise<Quote>;
  createQrCharge(data: NewQrChargeData): Promise<QrCharge>;
  findQrCharge(chargeId: string): Promise<QrCharge | null>;
  /** CLI-218: el QR pendiente más reciente que generó el paciente (con líneas) en alguno de sus presupuestos. */
  findPendingPatientQrCharge(patientId: string): Promise<QrCharge | null>;
  /** CLI-220: para el webhook de BANECO, que solo trae el qrId. */
  findQrChargeByQrId(qrId: string): Promise<QrCharge | null>;
  /** CLI-220: los cobros QR pendientes, el más antiguo primero (conciliación periódica). */
  findPendingQrCharges(): Promise<QrCharge[]>;
  /**
   * pending → paid, crea el pago qr_baneco por el monto del cobro y recalcula
   * total_paid + status, en una sola transacción. El cambio de estado va
   * primero con guarda `status = 'pending'`: si ya no estaba pendiente (otra
   * verificación ganó), no hace nada y devuelve null.
   */
  settleQrCharge(chargeId: string): Promise<Quote | null>;
  /** pending → cancelled. false si ya no estaba pendiente. */
  cancelQrCharge(chargeId: string): Promise<boolean>;
}

export const QuoteRepository = Symbol('IQuoteRepository');
