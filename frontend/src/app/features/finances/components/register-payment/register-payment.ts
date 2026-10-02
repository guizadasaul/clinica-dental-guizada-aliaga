import {
  Component,
  ChangeDetectionStrategy,
  inject,
  input,
  output,
  signal,
  effect,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { QuotesService } from '../../../quotes/services/quotes.service';
import type { Quote } from '../../../quotes/models/quote.model';
import { FinancesService } from '../../services/finances.service';
import type { QrCharge } from '../../models/finance.model';

type PaymentMode = 'cash' | 'qr';

/**
 * Registrar un pago del presupuesto (CLI-160): efectivo, o QR BANECO con un
 * botón "Verificar pago" que consulta al banco una sola vez — sin polling.
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
  readonly balance = input.required<number>();
  readonly paid = output<Quote>();
  readonly closed = output<void>();

  protected readonly mode = signal<PaymentMode>('cash');
  protected readonly amount = signal<number | null>(null);
  protected readonly notes = signal('');
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  /** Aviso no bloqueante tras verificar (ej. "todavía no se pagó"). */
  protected readonly notice = signal<string | null>(null);
  protected readonly charge = signal<QrCharge | null>(null);

  constructor() {
    // Por defecto se cobra el saldo completo.
    effect(() => this.amount.set(this.balance()));
  }

  protected setMode(mode: PaymentMode): void {
    if (this.charge()) { return; }
    this.mode.set(mode);
    this.error.set(null);
  }

  protected async onRegisterCash(): Promise<void> {
    const amount = this.validAmount();
    if (amount === null) { return; }
    await this.run(async () => {
      const quote = await firstValueFrom(
        this.quotesService.addPayment(this.quoteId(), {
          amount,
          paymentMethod: 'cash',
          notes: this.notes().trim() || undefined,
        }),
      );
      this.paid.emit(quote);
    }, 'No se pudo registrar el pago. Intenta de nuevo.');
  }

  protected async onGenerateQr(): Promise<void> {
    const amount = this.validAmount();
    if (amount === null) { return; }
    await this.run(async () => {
      this.charge.set(await firstValueFrom(this.financesService.createQrCharge(this.quoteId(), amount)));
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
      await firstValueFrom(this.financesService.cancelQrCharge(charge.chargeId));
      this.charge.set(null);
      this.notice.set(null);
    }, 'No se pudo anular el QR. Si ya fue pagado, verifícalo.');
  }

  protected onClose(): void {
    this.closed.emit();
  }

  private validAmount(): number | null {
    const amount = Number(this.amount());
    if (!amount || amount <= 0) {
      this.error.set('Ingresa un monto mayor a 0.');
      return null;
    }
    if (amount > this.balance()) {
      this.error.set('El monto no puede superar el saldo pendiente.');
      return null;
    }
    return amount;
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
