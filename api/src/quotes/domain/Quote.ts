import type { QuoteItem } from './QuoteItem';
import type { Payment } from './Payment';
import type { QuoteLine } from './QuoteBalance';

export interface Quote {
  id: string;
  patientId: string;
  /** Siempre en BOB — quote_items.unit_price ya viene convertido, ver QuoteItem.exchangeRate para trazabilidad. */
  totalAmount: number;
  totalPaid: number;
  /** totalAmount − totalPaid, nunca negativo (CLI-156). */
  balance: number;
  status: string;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  /** null = borrador, el paciente todavía no lo ve (CLI-156). */
  sharedAt: Date | null;
  items: QuoteItem[];
  payments: Payment[];
  /** CLI-218: cada tratamiento (grupos multi-diente juntos) con lo pagado y lo pendiente. */
  lines: QuoteLine[];
}
