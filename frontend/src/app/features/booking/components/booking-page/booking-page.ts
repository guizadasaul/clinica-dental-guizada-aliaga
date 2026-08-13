import { Component, ChangeDetectionStrategy, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { BookingService } from '../../services/booking.service';
import { StepSlotPickerComponent } from '../step-slot-picker/step-slot-picker';
import { StepGuestContactComponent } from '../step-guest-contact/step-guest-contact';
import { StepPaymentQrComponent } from '../step-payment-qr/step-payment-qr';
import { BookingConfirmedComponent } from '../booking-confirmed/booking-confirmed';
import { HoldCountdownComponent } from '../hold-countdown/hold-countdown';
import type { GuestContactRequest } from '../../models/booking.request';

type BookingStep = 'slot' | 'contact' | 'payment' | 'confirmed';

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

@Component({
  selector: 'app-booking-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    StepSlotPickerComponent,
    StepGuestContactComponent,
    StepPaymentQrComponent,
    BookingConfirmedComponent,
    HoldCountdownComponent,
  ],
  templateUrl: './booking-page.html',
  styleUrl: './booking-page.scss',
})
export class BookingPageComponent {
  private readonly bookingService = inject(BookingService);

  protected readonly step = signal<BookingStep>('slot');
  protected readonly selectedDate = signal(todayIso());
  protected readonly slots = signal<string[]>([]);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly appointmentId = signal<string | null>(null);
  protected readonly holdExpiresAt = signal<string | null>(null);
  protected readonly qrImageBase64 = signal<string | null>(null);
  protected readonly amount = signal<number | null>(null);

  constructor() {
    void this.loadAvailability(this.selectedDate());
  }

  protected async onDateChanged(date: string): Promise<void> {
    this.selectedDate.set(date);
    await this.loadAvailability(date);
  }

  private async loadAvailability(date: string): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const result = await firstValueFrom(this.bookingService.getAvailability(date));
      this.slots.set(result.slots);
    } catch {
      this.slots.set([]);
      this.error.set('No pudimos cargar los horarios disponibles. Intentá de nuevo.');
    } finally {
      this.loading.set(false);
    }
  }

  protected async onSlotSelected(slot: string): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const hold = await firstValueFrom(this.bookingService.holdSlot(slot));
      this.appointmentId.set(hold.appointmentId);
      this.holdExpiresAt.set(hold.holdExpiresAt);
      this.step.set('contact');
    } catch (err) {
      if (err instanceof HttpErrorResponse && err.status === 409) {
        this.error.set('Ese horario ya no está disponible, elegí otro.');
        await this.loadAvailability(this.selectedDate());
      } else {
        this.error.set('No pudimos reservar ese horario. Intentá de nuevo.');
      }
    } finally {
      this.loading.set(false);
    }
  }

  protected async onContactSubmit(data: GuestContactRequest): Promise<void> {
    const id = this.appointmentId();
    if (!id) {
      return;
    }
    this.loading.set(true);
    this.error.set(null);
    try {
      const contactResult = await firstValueFrom(this.bookingService.saveGuestContact(id, data));
      this.holdExpiresAt.set(contactResult.holdExpiresAt);

      const checkout = await firstValueFrom(this.bookingService.checkout(id));
      this.qrImageBase64.set(checkout.qrImageBase64);
      this.amount.set(checkout.amount);
      this.holdExpiresAt.set(checkout.holdExpiresAt);
      this.step.set('payment');
    } catch (err) {
      if (err instanceof HttpErrorResponse && err.status === 410) {
        this.error.set('El horario reservado ya venció. Elegí uno nuevo.');
        this.resetToSlotSelection();
      } else {
        this.error.set('No pudimos guardar tus datos. Intentá de nuevo.');
      }
    } finally {
      this.loading.set(false);
    }
  }

  protected onPaymentConfirmed(): void {
    this.step.set('confirmed');
  }

  protected onHoldExpired(): void {
    this.error.set('El tiempo para completar la reserva venció. Elegí un horario nuevamente.');
    this.resetToSlotSelection();
  }

  private resetToSlotSelection(): void {
    this.appointmentId.set(null);
    this.holdExpiresAt.set(null);
    this.step.set('slot');
    void this.loadAvailability(this.selectedDate());
  }
}
