import {
  Component,
  ChangeDetectionStrategy,
  computed,
  inject,
  signal,
} from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { DatePipe, DecimalPipe } from '@angular/common';
import { catchError, debounceTime, map, merge, of, Subject, switchMap } from 'rxjs';
import { PageHeaderComponent } from '../../../../shared/ui/page-header/page-header';
import { FinancesService } from '../../services/finances.service';
import type { PatientBalance, PatientFinanceDetail } from '../../models/finance.model';
import type { Quote } from '../../../quotes/models/quote.model';
import { paymentMethodLabel } from '../../../quotes/utils/quote-lines';
import { PaginationComponent, PAGE_SIZE } from '../../../../shared/ui/pagination/pagination';
import { ScrollIntoViewOnMobileDirective } from '../../../../shared/directives/scroll-into-view-on-mobile.directive';
import { clampPage, pageSlice } from '../../../../shared/utils/pagination.util';
import { RegisterPaymentComponent } from '../register-payment/register-payment';

type ListState = { status: 'loading' } | { status: 'error' } | { status: 'ready'; patients: PatientBalance[] };
type DetailState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; detail: PatientFinanceDetail };

const SEARCH_DEBOUNCE_MS = 250;

/**
 * Finanzas del doctor (CLI-160): elegir un paciente con presupuesto activo,
 * ver cuánto debe y registrar pagos en efectivo o con QR BANECO.
 */
@Component({
  selector: 'app-finances-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    PageHeaderComponent,
    DecimalPipe,
    DatePipe,
    RegisterPaymentComponent,
    PaginationComponent,
    ScrollIntoViewOnMobileDirective,
  ],
  templateUrl: './finances-page.html',
  styleUrl: './finances-page.scss',
})
export class FinancesPageComponent {
  private readonly financesService = inject(FinancesService);

  protected readonly search = signal('');
  /** Fuerza recargar la lista tras un pago (el saldo cambió). */
  private readonly reloadList$ = new Subject<void>();

  protected readonly list = toSignal(
    merge(
      toObservable(this.search).pipe(debounceTime(SEARCH_DEBOUNCE_MS)),
      this.reloadList$.pipe(map(() => this.search())),
    ).pipe(
      switchMap((term) =>
        this.financesService.listPatients(term).pipe(
          map((patients): ListState => ({ status: 'ready', patients })),
          catchError(() => of<ListState>({ status: 'error' })),
        ),
      ),
    ),
    { initialValue: { status: 'loading' } as ListState },
  );

  protected readonly patients = computed(() => {
    const state = this.list();
    return state.status === 'ready' ? state.patients : [];
  });

  /** Página pedida; la que se ve se ajusta si la lista se achicó (CLI-204). */
  private readonly requestedPage = signal(1);
  protected readonly currentPage = computed(() =>
    clampPage(this.requestedPage(), this.patients().length, PAGE_SIZE),
  );
  protected readonly visiblePatients = computed(() =>
    pageSlice(this.patients(), this.currentPage(), PAGE_SIZE),
  );

  protected onSearch(value: string): void {
    this.search.set(value);
    this.requestedPage.set(1);
  }

  protected goToPage(page: number): void {
    this.requestedPage.set(page);
  }

  protected readonly selectedId = signal<string | null>(null);
  protected readonly detailState = signal<DetailState>({ status: 'idle' });
  /** El presupuesto al que se le está registrando un pago; null sin el panel abierto. */
  protected readonly payingQuoteId = signal<string | null>(null);
  protected readonly lastPaymentNotice = signal<string | null>(null);

  protected readonly detail = computed(() => {
    const state = this.detailState();
    return state.status === 'ready' ? state.detail : null;
  });

  /**
   * CLI-265: todos sus presupuestos. Pagado uno, lo siguiente que se registra
   * va a uno nuevo, y el historial tiene que seguir completo.
   */
  protected readonly quotes = computed(() => this.detail()?.quotes ?? []);

  /** Totales de todos los presupuestos, como "Mi presupuesto" del paciente. */
  protected readonly totals = computed(() => {
    const quotes = this.quotes();
    return {
      total: quotes.reduce((sum, q) => sum + q.totalAmount, 0),
      paid: quotes.reduce((sum, q) => sum + q.totalPaid, 0),
      balance: quotes.reduce((sum, q) => sum + q.balance, 0),
    };
  });

  /** Los presupuestos con saldo: cada pago se registra sobre uno de ellos. */
  protected readonly payableQuotes = computed(() => this.quotes().filter((q) => q.balance > 0));

  protected readonly payingQuote = computed(
    () => this.quotes().find((q) => q.id === this.payingQuoteId()) ?? null,
  );

  /** CLI-262: cada tratamiento con lo pagado y lo pendiente, como lo calcula el API. */
  protected readonly lines = computed(() => this.quotes().flatMap((q) => q.lines));

  /** Los pagos de todos los presupuestos, más recientes primero. */
  protected readonly payments = computed(() =>
    this.quotes()
      .flatMap((q) => q.payments)
      .sort((a, b) => b.paymentDate.localeCompare(a.paymentDate)),
  );

  protected readonly methodLabel = paymentMethodLabel;

  protected onSelect(patientId: string): void {
    this.selectedId.set(patientId);
    this.payingQuoteId.set(null);
    this.lastPaymentNotice.set(null);
    this.detailState.set({ status: 'loading' });
    this.financesService.getPatientDetail(patientId).subscribe({
      next: (detail) => this.detailState.set({ status: 'ready', detail }),
      error: () => this.detailState.set({ status: 'error' }),
    });
  }

  protected onPaid(quote: Quote): void {
    const detail = this.detail();
    if (!detail) { return; }
    const before = detail.quotes.find((q) => q.id === quote.id);
    const paid = quote.totalPaid - (before?.totalPaid ?? 0);
    const quotes = detail.quotes.map((q) => (q.id === quote.id ? quote : q));
    this.detailState.set({ status: 'ready', detail: { ...detail, quotes } });
    this.payingQuoteId.set(null);
    this.lastPaymentNotice.set(`Pago de Bs. ${paid.toFixed(2)} registrado.`);
    this.reloadList$.next();
  }
}
