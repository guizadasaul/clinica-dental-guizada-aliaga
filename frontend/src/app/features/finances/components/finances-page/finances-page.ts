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
import { groupQuoteLines, paymentMethodLabel } from '../../../quotes/utils/quote-lines';
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
  imports: [PageHeaderComponent, DecimalPipe, DatePipe, RegisterPaymentComponent],
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

  protected readonly selectedId = signal<string | null>(null);
  protected readonly detailState = signal<DetailState>({ status: 'idle' });
  protected readonly paying = signal(false);
  protected readonly lastPaymentNotice = signal<string | null>(null);

  protected readonly detail = computed(() => {
    const state = this.detailState();
    return state.status === 'ready' ? state.detail : null;
  });

  protected readonly lines = computed(() => groupQuoteLines(this.detail()?.quote?.items ?? []));

  /** Más recientes primero. */
  protected readonly payments = computed(() =>
    [...(this.detail()?.quote?.payments ?? [])].sort((a, b) =>
      b.paymentDate.localeCompare(a.paymentDate),
    ),
  );

  protected readonly methodLabel = paymentMethodLabel;

  protected onSelect(patientId: string): void {
    this.selectedId.set(patientId);
    this.paying.set(false);
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
    const paid = quote.totalPaid - (detail.quote?.totalPaid ?? 0);
    this.detailState.set({ status: 'ready', detail: { ...detail, quote } });
    this.paying.set(false);
    this.lastPaymentNotice.set(`Pago de Bs. ${paid.toFixed(2)} registrado.`);
    this.reloadList$.next();
  }
}
