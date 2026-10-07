export interface QuoteItem {
  id: string;
  quoteId: string;
  treatmentId: string;
  treatmentName: string;
  toothNumber: number | null;
  applicationGroupId: string | null;
  unitPrice: number;
  quantity: number;
  subtotal: number;
  currency: string;
  exchangeRate: number | null;
  /** CLI-226: el tratamiento registrado que cumplió esta fila; null = por realizar. */
  procedureId: string | null;
  /** CLI-226: fecha (YYYY-MM-DD…) de ese tratamiento. */
  performedAt: string | null;
}

/** CLI-218: a qué tratamiento se aplicó (parte de) un pago. */
export interface PaymentCoverage {
  lineKey: string;
  treatmentName: string;
  amount: number;
}

/** CLI-218: un tratamiento del presupuesto (grupos multi-diente juntos), con lo pagado y lo pendiente. */
export interface QuoteLine {
  /** applicationGroupId del grupo, o id de la fila suelta. */
  key: string;
  treatmentName: string;
  toothNumbers: number[];
  total: number;
  paid: number;
  pending: number;
  /** CLI-226: cuándo se realizó (todas sus filas); null = por realizar. */
  performedAt: string | null;
}

export interface Payment {
  id: string;
  quoteId: string;
  amount: number;
  paymentMethod: string | null;
  receiptNumber: string;
  paymentDate: string;
  notes: string | null;
  createdAt: string;
  /** CLI-218: a qué tratamientos se aplicó, calculado por el backend. */
  covered: PaymentCoverage[];
}

export interface Quote {
  id: string;
  patientId: string;
  totalAmount: number;
  totalPaid: number;
  /** totalAmount − totalPaid, nunca negativo (CLI-156). */
  balance: number;
  status: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  /** null = borrador que el paciente todavía no ve (CLI-156). */
  sharedAt: string | null;
  items: QuoteItem[];
  payments: Payment[];
  /** CLI-218: lo pagado y lo pendiente por tratamiento, calculado por el backend. */
  lines: QuoteLine[];
}
