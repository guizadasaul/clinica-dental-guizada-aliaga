import { Component, ChangeDetectionStrategy, DestroyRef, inject, input, output } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { interval, switchMap } from 'rxjs';
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

  constructor() {
    const bookingService = inject(BookingService);
    const destroyRef = inject(DestroyRef);

    interval(POLL_INTERVAL_MS)
      .pipe(
        switchMap(() => bookingService.getStatus(this.appointmentId())),
        takeUntilDestroyed(destroyRef),
      )
      .subscribe((status) => {
        if (status.paid) {
          this.confirmed.emit();
        }
      });
  }
}
