import type { QuoteItem } from './QuoteItem';
import type { Payment } from './Payment';

export interface Quote {
  id: string;
  patientId: string;
  /** Siempre en BOB — quote_items.unit_price ya viene convertido, ver QuoteItem.exchangeRate para trazabilidad. */
  totalAmount: number;
  totalPaid: number;
  status: string;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  items: QuoteItem[];
  payments: Payment[];
}
