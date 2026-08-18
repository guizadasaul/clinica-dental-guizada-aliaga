import { Component, ChangeDetectionStrategy, inject, input, output, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { BookingService } from '../../services/booking.service';

const CLINIC_PHONE = '+59157744250';

@Component({
  selector: 'app-step-payment-qr',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './step-payment-qr.html',
  styleUrl: './step-payment-qr.scss',
})
export class StepPaymentQrComponent {
  readonly appointmentId = input.required<string>();
  readonly qrImageBase64 = input.required<string>();
  readonly amount = input.required<number>();
  readonly confirmed = output<void>();

  protected readonly clinicPhoneHref = `tel:${CLINIC_PHONE}`;
  protected readonly clinicPhoneLabel = CLINIC_PHONE;
  protected readonly checkingNow = signal(false);
  protected readonly justCheckedNotPaid = signal(false);

  private readonly bookingService = inject(BookingService);

  // Sin auto-poll a propósito: la confirmación depende solo de este botón
  // (o del webhook de BANECO del lado del backend, que no toca la UI). Sin
  // reconsultas automáticas de por medio, no hay ventana donde el sistema
  // "podría" confirmar sin que el paciente haya efectivamente verificado.
  protected async checkNow(): Promise<void> {
    this.checkingNow.set(true);
    this.justCheckedNotPaid.set(false);
    try {
      const status = await firstValueFrom(this.bookingService.getStatus(this.appointmentId()));
      if (status.paid) {
        this.confirmed.emit();
      } else {
        this.justCheckedNotPaid.set(true);
      }
    } finally {
      this.checkingNow.set(false);
    }
  }
}
