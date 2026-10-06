import { Component, ChangeDetectionStrategy, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { catchError, map, of } from 'rxjs';
import { QuotesService } from '../../services/quotes.service';
import type { Quote } from '../../models/quote.model';
import { groupQuoteLines, paymentMethodLabel } from '../../utils/quote-lines';
import { allocatePayments, type Allocation, type LineStatus } from '../../utils/payment-allocation';
import { formatBs } from '../../../../shared/utils/money.util';
import { CLINIC_TIME_ZONE } from '../../../../shared/utils/clinic-date.util';

const DATE_FORMATTER = new Intl.DateTimeFormat('es-BO', {
  timeZone: CLINIC_TIME_ZONE,
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

const STATUS_LABELS: Record<LineStatus, string> = {
  paid: 'Pagado',
  partial: 'Parcial',
  pending: 'Pendiente',
};

interface QuoteView {
  readonly quote: Quote;
  readonly date: string;
  readonly allocation: Allocation;
}

type LoadState = { status: 'loading' } | { status: 'error' } | { status: 'ready'; views: QuoteView[] };

function toView(quote: Quote): QuoteView {
  return {
    quote,
    date: DATE_FORMATTER.format(new Date(quote.createdAt)),
    allocation: allocatePayments(groupQuoteLines(quote.items), quote.payments),
  };
}

/**
 * "Mi presupuesto" del paciente (CLI-158, rediseñado en CLI-212): lo que debe,
 * lo que pagó con fechas y a qué tratamiento se aplicó cada pago. Los pagos
 * se registran contra el presupuesto entero; el reparto por tratamiento lo
 * calcula allocatePayments (en orden, el más antiguo primero).
 */
@Component({
  selector: 'app-my-quote',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './my-quote.html',
  styleUrl: './my-quote.scss',
})
export class MyQuoteComponent {
  private readonly quotesService = inject(QuotesService);

  protected readonly state = toSignal(
    this.quotesService.getMine().pipe(
      map((quotes): LoadState => ({ status: 'ready', views: quotes.map(toView) })),
      catchError(() => of<LoadState>({ status: 'error' })),
    ),
    { initialValue: { status: 'loading' } as LoadState },
  );

  protected readonly views = computed(() => {
    const state = this.state();
    return state.status === 'ready' ? state.views : [];
  });

  /** Totales de todos los presupuestos compartidos. */
  protected readonly totals = computed(() => {
    const quotes = this.views().map((v) => v.quote);
    const total = quotes.reduce((sum, q) => sum + q.totalAmount, 0);
    const paid = quotes.reduce((sum, q) => sum + q.totalPaid, 0);
    const balance = quotes.reduce((sum, q) => sum + q.balance, 0);
    return {
      total,
      paid,
      balance,
      paidPercent: total > 0 ? Math.min(100, Math.round((paid / total) * 100)) : 0,
    };
  });

  protected readonly bs = formatBs;
  protected readonly methodLabel = paymentMethodLabel;
  protected readonly statusLabel = (status: LineStatus) => STATUS_LABELS[status];
  protected readonly paymentDate = (iso: string) => DATE_FORMATTER.format(new Date(iso));
}
