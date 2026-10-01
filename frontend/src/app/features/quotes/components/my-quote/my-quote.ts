import { Component, ChangeDetectionStrategy, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { DecimalPipe, DatePipe } from '@angular/common';
import { catchError, map, of } from 'rxjs';
import { QuotesService } from '../../services/quotes.service';
import type { Quote } from '../../models/quote.model';
import { groupQuoteLines, paymentMethodLabel, type QuoteLine } from '../../utils/quote-lines';

interface QuoteView {
  readonly quote: Quote;
  readonly lines: QuoteLine[];
  /** 0–100, para la barra de progreso. */
  readonly paidPercent: number;
}

type LoadState = { status: 'loading' } | { status: 'error' } | { status: 'ready'; views: QuoteView[] };

function toView(quote: Quote): QuoteView {
  const paidPercent =
    quote.totalAmount > 0 ? Math.min(100, Math.round((quote.totalPaid / quote.totalAmount) * 100)) : 0;
  return { quote, lines: groupQuoteLines(quote.items), paidPercent };
}

/**
 * "Mi presupuesto" del paciente (CLI-158): solo lectura, con los presupuestos
 * que su doctor ya compartió (GET /patients/me/quotes, CLI-156), el más
 * reciente primero.
 */
@Component({
  selector: 'app-my-quote',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DecimalPipe, DatePipe],
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

  protected readonly methodLabel = paymentMethodLabel;
}
