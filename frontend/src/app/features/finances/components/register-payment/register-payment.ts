import {
  Component,
  ChangeDetectionStrategy,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { QuotesService } from '../../../quotes/services/quotes.service';
import type { Quote, QuoteLine } from '../../../quotes/models/quote.model';
import { FinancesService } from '../../services/finances.service';
import type { QrCharge } from '../../models/finance.model';

type PaymentMode = 'cash' | 'qr';

/**
 * Registrar un pago del presupuesto (CLI-160): efectivo, o QR BANECO con un
 * botón "Verificar pago" que consulta al banco una sola vez — sin polling.
 * Desde CLI-261 se eligen los tratamientos que se pagan, cada uno por su
 * saldo completo, y el pago queda asignado a ellos (antes el monto se
 * escribía a mano y se repartía en orden).
 * Emite el presupuesto actualizado cuando el pago quedó registrado.
 */
@Component({
  selector: 'app-register-payment',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DecimalPipe, FormsModule],
  templateUrl: './register-payment.html',
  styleUrl: './register-payment.scss',
})
export class RegisterPaymentComponent {
  private readonly quotesService = inject(QuotesService);
  private readonly financesService = inject(FinancesService);

  readonly quoteId = input.required<string>();
  /** Los tratamientos del presupuesto con lo pagado y lo pendiente. */
  readonly lines = input.required<QuoteLine[]>();
  readonly paid = output<Quote>();
  readonly closed = output<void>();

  protected readonly mode = signal<PaymentMode>('cash');
  /** Los que todavía deben algo: los únicos que se pueden elegir. */
  protected readonly payable = computed(() => this.lines().filter((l) => l.pending > 0));
  /** Empieza vacío: con muchos tratamientos, lo común es cobrar uno o dos. "Todos" los marca de una. */
  protected readonly selected = signal<ReadonlySet<string>>(new Set());
  protected readonly selectedTotal = computed(() =>
    this.payable()
      .filter((l) => this.selected().has(l.key))
      .reduce((sum, l) => sum + l.pending, 0),
  );
  protected readonly allSelected = computed(
    () => this.payable().length > 0 && this.payable().every((l) => this.selected().has(l.key)),
  );
  protected readonly notes = signal('');
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  /** Aviso no bloqueante tras verificar (ej. "todavía no se pagó"). */
  protected readonly notice = signal<string | null>(null);
  protected readonly charge = signal<QrCharge | null>(null);

  protected setMode(mode: PaymentMode): void {
    if (this.charge()) { return; }
    this.mode.set(mode);
    this.error.set(null);
  }

  protected toggleLine(key: string): void {
    const next = new Set(this.selected());
    if (next.has(key)) {
      next.delete(key);
    } else {
      next.add(key);
    }
    this.selected.set(next);
    this.error.set(null);
  }

  protected toggleAll(): void {
    this.selected.set(this.allSelected() ? new Set() : new Set(this.payable().map((l) => l.key)));
    this.error.set(null);
  }

  protected async onRegisterCash(): Promise<void> {
    const lineKeys = this.chosenKeys();
    if (lineKeys === null) { return; }
    await this.run(async () => {
      const quote = await firstValueFrom(
        this.quotesService.addPayment(this.quoteId(), {
          lineKeys,
          paymentMethod: 'cash',
          notes: this.notes().trim() || undefined,
        }),
      );
      this.paid.emit(quote);
    }, 'No se pudo registrar el pago. Intenta de nuevo.');
  }

  protected async onGenerateQr(): Promise<void> {
    const lineKeys = this.chosenKeys();
    if (lineKeys === null) { return; }
    await this.run(async () => {
      this.charge.set(await firstValueFrom(this.financesService.createQrCharge(this.quoteId(), lineKeys)));
    }, 'No se pudo generar el QR de BANECO. Intenta de nuevo en un momento.');
  }

  protected async onVerify(): Promise<void> {
    const charge = this.charge();
    if (!charge) { return; }
    this.notice.set(null);
    await this.run(async () => {
      const result = await firstValueFrom(this.financesService.verifyQrCharge(charge.chargeId));
      if (result.status === 'paid') {
        this.paid.emit(result.quote);
      } else if (result.status === 'cancelled') {
        this.charge.set(null);
        this.notice.set('El QR fue anulado. Genera uno nuevo para cobrar.');
      } else {
        this.notice.set('Todavía no llegó el pago. Cuando el paciente confirme en su app, verifica de nuevo.');
      }
    }, 'No se pudo consultar el pago en BANECO. Intenta de nuevo.');
  }

  protected async onCancelQr(): Promise<void> {
    const charge = this.charge();
    if (!charge) { return; }
    await this.run(async () => {
      const result = await firstValueFrom(this.financesService.cancelQrCharge(charge.chargeId));
      // CLI-220: si el paciente ya había pagado, no se anula: se registró el pago.
      if (result.status === 'paid') {
        this.paid.emit(result.quote);
        return;
      }
      this.charge.set(null);
      this.notice.set(null);
    }, 'No se pudo anular el QR. Intenta de nuevo en un momento.');
  }

  protected onClose(): void {
    this.closed.emit();
  }

  private chosenKeys(): string[] | null {
    const keys = this.payable()
      .filter((l) => this.selected().has(l.key))
      .map((l) => l.key);
    if (keys.length === 0) {
      this.error.set('Elige al menos un tratamiento.');
      return null;
    }
    return keys;
  }

  private async run(action: () => Promise<void>, failure: string): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      await action();
    } catch {
      this.error.set(failure);
    } finally {
      this.busy.set(false);
    }
  }
}
