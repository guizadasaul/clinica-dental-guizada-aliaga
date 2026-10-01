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
}
