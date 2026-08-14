export interface QuoteItem {
  id: string;
  quoteId: string;
  treatmentId: string;
  toothNumber: number | null;
  applicationGroupId: string | null;
  unitPrice: number;
  quantity: number;
  subtotal: number;
  currency: string;
  exchangeRate: number | null;
}

export interface Quote {
  id: string;
  patientId: string;
  totalAmount: number;
  totalPaid: number;
  status: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  items: QuoteItem[];
}
