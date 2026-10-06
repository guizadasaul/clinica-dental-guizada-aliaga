import { Component, ChangeDetectionStrategy, computed, inject, signal, type OnInit } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { HttpErrorResponse } from '@angular/common/http';
import { catchError, firstValueFrom, map, of, startWith, switchMap } from 'rxjs';
import { QuotesService } from '../../services/quotes.service';
import type { Payment, Quote, QuoteLine } from '../../models/quote.model';
import type { QrCharge } from '../../../finances/models/finance.model';
import { paymentMethodLabel } from '../../utils/quote-lines';
import { PageHeaderComponent } from '../../../../shared/ui/page-header/page-header';
import { PaginationComponent, PAGE_SIZE } from '../../../../shared/ui/pagination/pagination';
import { clampPage, pageSlice } from '../../../../shared/utils/pagination.util';
import { formatBs } from '../../../../shared/utils/money.util';
import { CLINIC_TIME_ZONE } from '../../../../shared/utils/clinic-date.util';

// Mismo formato corto que Finanzas del doctor (dd/mm/aaaa), en hora de Bolivia.
const DATE_FORMATTER = new Intl.DateTimeFormat('es-BO', {
  timeZone: CLINIC_TIME_ZONE,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

interface QuoteView {
  readonly quote: Quote;
  readonly date: string;
  /** Los pagos del más reciente al más antiguo. */
  readonly payments: Payment[];
}

type LoadState = { status: 'loading' } | { status: 'error' } | { status: 'ready'; views: QuoteView[] };

function byNewest(a: Payment, b: Payment): number {
  return b.paymentDate.localeCompare(a.paymentDate) || b.createdAt.localeCompare(a.createdAt);
}

function toView(quote: Quote): QuoteView {
  const payments = [...quote.payments];
  payments.sort(byNewest);
  return { quote, date: DATE_FORMATTER.format(new Date(quote.createdAt)), payments };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * "Mi presupuesto" del paciente (CLI-158, rediseñado en CLI-212 y con el
 * estilo de Finanzas del doctor desde CLI-216): lo que debe, lo que pagó con
 * fechas y a qué tratamiento se aplicó cada pago (lo calcula el backend,
 * CLI-218). Desde CLI-219 puede elegir tratamientos con saldo y pagarlos con
 * un QR BANECO; el pago se confirma con "Ya pagué, verificar" (sin polling).
 */
@Component({
  selector: 'app-my-quote',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PageHeaderComponent, PaginationComponent],
  templateUrl: './my-quote.html',
  styleUrl: './my-quote.scss',
})
export class MyQuoteComponent implements OnInit {
  private readonly quotesService = inject(QuotesService);

  /** Se incrementa para volver a pedir los presupuestos (después de un pago). */
  private readonly reload = signal(0);

  protected readonly state = toSignal(
    toObservable(this.reload).pipe(
      switchMap(() =>
        this.quotesService.getMine().pipe(
          map((quotes): LoadState => ({ status: 'ready', views: quotes.map(toView) })),
          catchError(() => of<LoadState>({ status: 'error' })),
          startWith<LoadState>({ status: 'loading' }),
        ),
      ),
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

  // ── Paginación (CLI-216): tratamientos y pagos de cada presupuesto, de a 10 ──
  private readonly pages = signal<Record<string, number>>({});

  private pageOf(key: string, total: number): number {
    return clampPage(this.pages()[key] ?? 1, total, PAGE_SIZE);
  }

  protected linePage(view: QuoteView): number {
    return this.pageOf(`${view.quote.id}:lines`, view.quote.lines.length);
  }

  protected pagedLines(view: QuoteView): QuoteLine[] {
    return pageSlice(view.quote.lines, this.linePage(view), PAGE_SIZE);
  }

  protected paymentPage(view: QuoteView): number {
    return this.pageOf(`${view.quote.id}:payments`, view.payments.length);
  }

  protected pagedPayments(view: QuoteView): Payment[] {
    return pageSlice(view.payments, this.paymentPage(view), PAGE_SIZE);
  }

  protected goToLinePage(view: QuoteView, page: number): void {
    this.pages.update((pages) => ({ ...pages, [`${view.quote.id}:lines`]: page }));
  }

  protected goToPaymentPage(view: QuoteView, page: number): void {
    this.pages.update((pages) => ({ ...pages, [`${view.quote.id}:payments`]: page }));
  }

  // ── Selección de tratamientos a pagar (CLI-219) ─────────────────────────
  // Un QR es de un solo presupuesto: elegir en otro reinicia la selección.
  private readonly selection = signal<{ quoteId: string | null; keys: ReadonlySet<string> }>({
    quoteId: null,
    keys: new Set(),
  });

  protected isSelected(view: QuoteView, line: QuoteLine): boolean {
    const sel = this.selection();
    return sel.quoteId === view.quote.id && sel.keys.has(line.key);
  }

  protected toggleLine(view: QuoteView, line: QuoteLine): void {
    this.selection.update((sel) => {
      const keys = new Set(sel.quoteId === view.quote.id ? sel.keys : []);
      if (keys.has(line.key)) {
        keys.delete(line.key);
      } else {
        keys.add(line.key);
      }
      return { quoteId: view.quote.id, keys };
    });
  }

  private pendingLines(view: QuoteView): QuoteLine[] {
    return view.quote.lines.filter((l) => l.pending > 0);
  }

  protected allSelected(view: QuoteView): boolean {
    const pending = this.pendingLines(view);
    return pending.length > 0 && pending.every((l) => this.isSelected(view, l));
  }

  protected toggleAll(view: QuoteView): void {
    const keys = this.allSelected(view) ? [] : this.pendingLines(view).map((l) => l.key);
    this.selection.set({ quoteId: view.quote.id, keys: new Set(keys) });
  }

  protected selectedCount(view: QuoteView): number {
    const sel = this.selection();
    return sel.quoteId === view.quote.id ? sel.keys.size : 0;
  }

  protected selectedTotal(view: QuoteView): number {
    return round2(
      view.quote.lines.filter((l) => this.isSelected(view, l)).reduce((sum, l) => sum + l.pending, 0),
    );
  }

  // ── Cobro con QR (CLI-219) ──────────────────────────────────────────────
  /** El QR sin pagar del paciente (generado ahora o antes); null si no tiene. */
  protected readonly charge = signal<QrCharge | null>(null);
  protected readonly qrOpen = signal(false);
  protected readonly busy = signal(false);
  protected readonly qrMessage = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);
  protected readonly error = signal<string | null>(null);

  /** Los tratamientos que cubre el QR abierto, con su nombre. */
  protected readonly chargeLines = computed(() => {
    const charge = this.charge();
    if (!charge) {
      return [];
    }
    const lines = this.views().flatMap((v) => v.quote.lines);
    return charge.lines.map((l) => ({
      key: l.lineKey,
      name: lines.find((line) => line.key === l.lineKey)?.treatmentName ?? 'Tratamiento',
      amount: l.amount,
    }));
  });

  ngOnInit(): void {
    void this.resumePendingCharge();
  }

  /**
   * CLI-220: un QR que quedó vivo (p. ej. se cerró la pestaña con el QR
   * abierto) se verifica solo al entrar: si ya se pagó se confirma; si no,
   * se vuelve a mostrar para que lo pague o lo cierre (y muera).
   */
  private async resumePendingCharge(): Promise<void> {
    await this.loadPendingCharge();
    if (this.charge()) {
      await this.verifyQr('Tienes un QR sin pagar. Págalo o ciérralo para anularlo.');
    }
  }

  private async loadPendingCharge(): Promise<void> {
    try {
      this.charge.set(await firstValueFrom(this.quotesService.getMyPendingQrCharge()));
    } catch {
      this.charge.set(null);
    }
  }

  protected async payWithQr(view: QuoteView): Promise<void> {
    const sel = this.selection();
    if (this.busy() || sel.quoteId !== view.quote.id || sel.keys.size === 0) {
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    this.notice.set(null);
    try {
      const charge = await firstValueFrom(this.quotesService.createMyQrCharge(view.quote.id, [...sel.keys]));
      this.charge.set(charge);
      this.qrMessage.set(null);
      this.qrOpen.set(true);
      this.selection.set({ quoteId: null, keys: new Set() });
    } catch (err) {
      if (err instanceof HttpErrorResponse && err.status === 409) {
        // Ya tenía uno sin pagar: se lo mostramos para que lo pague o lo anule.
        await this.loadPendingCharge();
        this.qrMessage.set('Ya tenías un QR sin pagar. Págalo o ciérralo para generar otro.');
        this.qrOpen.set(this.charge() !== null);
      } else {
        this.error.set('No pudimos generar el QR. Intenta de nuevo en un momento.');
      }
    } finally {
      this.busy.set(false);
    }
  }

  /**
   * CLI-220: cerrar el QR (X, clic afuera o Escape) lo anula — no queda vivo.
   * La anulación es segura: si BANECO ya lo había cobrado, se registra el
   * pago y se confirma en vez de anular.
   */
  protected closeQr(): void {
    void this.cancelQr('Cerraste el QR y quedó anulado. Puedes generar uno nuevo cuando quieras.');
  }

  /** Cierra solo si el clic cae en el fondo oscuro, no dentro del panel. */
  protected onBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.closeQr();
    }
  }

  /** Consulta a BANECO una sola vez. Con `pendingMessage`, si sigue sin pagar abre el QR con ese aviso. */
  protected async verifyQr(pendingMessage?: string): Promise<void> {
    const charge = this.charge();
    if (!charge || this.busy()) {
      return;
    }
    this.busy.set(true);
    this.qrMessage.set(null);
    try {
      const result = await firstValueFrom(this.quotesService.verifyMyQrCharge(charge.chargeId));
      if (result.status === 'paid') {
        this.confirmPaid(charge);
      } else if (result.status === 'cancelled') {
        this.finishCharge('El QR fue anulado en BANECO. Puedes generar uno nuevo.');
      } else {
        this.qrMessage.set(
          pendingMessage ?? 'Todavía no recibimos el pago. Si ya pagaste, espera unos segundos y vuelve a verificar.',
        );
        this.qrOpen.set(true);
      }
    } catch {
      this.qrMessage.set('No pudimos consultar el pago. Intenta de nuevo en un momento.');
      this.qrOpen.set(true);
    } finally {
      this.busy.set(false);
    }
  }

  protected async cancelQr(
    notice = 'Anulaste el QR. Puedes generar uno nuevo cuando quieras.',
  ): Promise<void> {
    const charge = this.charge();
    if (!charge || this.busy()) {
      return;
    }
    this.busy.set(true);
    this.qrMessage.set(null);
    try {
      const result = await firstValueFrom(this.quotesService.cancelMyQrCharge(charge.chargeId));
      if (result.status === 'paid') {
        // Ya había pagado: no se anuló, se registró el pago.
        this.confirmPaid(charge);
      } else {
        this.finishCharge(notice);
      }
    } catch {
      // Nunca se da por anulado sin confirmación: el QR sigue abierto.
      this.qrMessage.set('No pudimos anular el QR. Si ya pagaste, presiona "Ya pagué, verificar".');
      this.qrOpen.set(true);
    } finally {
      this.busy.set(false);
    }
  }

  private confirmPaid(charge: QrCharge): void {
    this.finishCharge(`¡Pago confirmado! Registramos ${this.bs(charge.amount)}.`);
    this.reload.update((n) => n + 1);
  }

  private finishCharge(notice: string): void {
    this.charge.set(null);
    this.qrOpen.set(false);
    this.notice.set(notice);
  }

  protected readonly bs = formatBs;
  protected readonly methodLabel = paymentMethodLabel;
  protected readonly paymentDate = (iso: string) => DATE_FORMATTER.format(new Date(iso));
}
