import { Component, ChangeDetectionStrategy, DestroyRef, inject, input, output, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { firstValueFrom, interval, switchMap } from 'rxjs';
import { BookingService } from '../../services/booking.service';

const POLL_INTERVAL_MS = 4000;
const CLINIC_PHONE = '+591700000000';

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

  constructor() {
    const destroyRef = inject(DestroyRef);

    interval(POLL_INTERVAL_MS)
      .pipe(
        switchMap(() => this.bookingService.getStatus(this.appointmentId())),
        takeUntilDestroyed(destroyRef),
      )
      .subscribe((status) => {
        if (status.paid) {
          this.confirmed.emit();
        }
      });
  }

  // El poll automático ya reconsulta cada 4s, pero un botón manual le da al
  // paciente control inmediato en vez de esperar el próximo tick.
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
