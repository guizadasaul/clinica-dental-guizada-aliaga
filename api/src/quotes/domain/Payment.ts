export interface Payment {
  id: string;
  quoteId: string;
  amount: number;
  paymentMethod: string | null;
  receiptNumber: string;
  paymentDate: Date;
  notes: string | null;
  createdAt: Date;
}
