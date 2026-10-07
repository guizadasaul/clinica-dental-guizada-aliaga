import { Component, ChangeDetectionStrategy, computed, inject, signal, OnInit } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { BookingProgressComponent, type BookingStepKey } from '../booking-progress/booking-progress';
import { BookingService } from '../../services/booking.service';
import { DoctorPickerComponent } from '../doctor-picker/doctor-picker';
import { WeekSlotPickerComponent } from '../week-slot-picker/week-slot-picker';
import { StepGuestContactComponent } from '../step-guest-contact/step-guest-contact';
import { StepPaymentQrComponent } from '../step-payment-qr/step-payment-qr';
import { BookingConfirmedComponent } from '../booking-confirmed/booking-confirmed';
import { HoldCountdownComponent } from '../hold-countdown/hold-countdown';
import type { GuestContactRequest } from '../../models/booking.request';
import type { Doctor } from '../../models/booking.model';

type BookingStep = BookingStepKey;

/** La API limita los intentos de reserva por IP y hora (429): se avisa con un mensaje propio, no con el genérico (CLI-169). */
const RATE_LIMIT_MESSAGE =
  'Superaste el límite de intentos de reserva. Espera un momento (hasta una hora) y vuelve a intentarlo.';

function isRateLimited(err: unknown): boolean {
  return err instanceof HttpErrorResponse && err.status === 429;
}

/** Subtítulo propio de cada paso (CLI-166): el de antes era fijo para todos. */
const STEP_SUBTITLES: Record<BookingStep, string> = {
  doctor: 'Elige con qué doctor quieres tu consulta.',
  slot: 'Elige el día y la hora que mejor te quede.',
  contact: 'Déjanos tus datos para reservar tu lugar. Tu horario queda guardado unos minutos.',
  payment: 'Escanea el código QR con la app de tu banco para pagar y confirmar tu cita.',
  confirmed: '¡Listo! Tu cita quedó confirmada.',
};

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

@Component({
  selector: 'app-booking-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    BookingProgressComponent,
    DoctorPickerComponent,
    WeekSlotPickerComponent,
    StepGuestContactComponent,
    StepPaymentQrComponent,
    BookingConfirmedComponent,
    HoldCountdownComponent,
  ],
  templateUrl: './booking-page.html',
  styleUrl: './booking-page.scss',
})
export class BookingPageComponent implements OnInit {
  private readonly bookingService = inject(BookingService);
  private readonly route = inject(ActivatedRoute);

  protected readonly step = signal<BookingStep>('doctor');
  protected readonly doctors = signal<Doctor[]>([]);
  protected readonly doctorsLoading = signal(false);
  protected readonly selectedDoctorId = signal<string | null>(null);
  protected readonly slotsByDate = signal<Record<string, string[]>>({});
  protected readonly subtitle = computed(() => STEP_SUBTITLES[this.step()]);
  protected readonly selectedDoctor = computed(
    () => this.doctors().find((d) => d.id === this.selectedDoctorId()) ?? null,
  );
  protected readonly selectedDoctorName = computed(
    () => this.doctors().find((d) => d.id === this.selectedDoctorId())?.displayName ?? null,
  );
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly appointmentId = signal<string | null>(null);
  protected readonly holdExpiresAt = signal<string | null>(null);
  protected readonly qrImageBase64 = signal<string | null>(null);
  protected readonly amount = signal<number | null>(null);

  ngOnInit(): void {
    // Si venimos de la landing con doctor y horario ya elegidos
    // (?doctorId=&slot=iso), reservamos directo y saltamos al paso de
    // contacto — sin pasar por el picker de doctor ni el de horarios. Si
    // el hold falla (409/410) onSlotSelected ya nos deja en el paso 'slot'
    // con la disponibilidad de ESE doctor recién cargada.
    const preselectedSlot = this.route.snapshot.queryParamMap.get('slot');
    const preselectedDoctorId = this.route.snapshot.queryParamMap.get('doctorId');
    if (preselectedSlot && preselectedDoctorId) {
      this.selectedDoctorId.set(preselectedDoctorId);
      this.step.set('slot');
      void this.loadAvailability(preselectedDoctorId);
      void this.onSlotSelected(preselectedSlot);
      // El nombre y el teléfono del doctor elegido (botón "Contactanos") viven
      // en la lista: se pide aparte, sin mostrar errores, porque en este
      // flujo el picker de doctores no se usa.
      void this.loadDoctorsQuietly();
    } else {
      void this.loadDoctors();
    }
  }

  private async loadDoctorsQuietly(): Promise<void> {
    try {
      this.doctors.set(await firstValueFrom(this.bookingService.getDoctors()));
    } catch {
      // Sin la lista, "Contactanos" usa el número de la clínica.
    }
  }

  private async loadDoctors(): Promise<void> {
    this.doctorsLoading.set(true);
    this.error.set(null);
    try {
      const result = await firstValueFrom(this.bookingService.getDoctors());
      this.doctors.set(result);
    } catch {
      this.error.set('No pudimos cargar los doctores disponibles. Intenta de nuevo.');
    } finally {
      this.doctorsLoading.set(false);
    }
  }

  protected onDoctorSelected(doctorId: string): void {
    this.selectedDoctorId.set(doctorId);
    this.step.set('slot');
    void this.loadAvailability(doctorId);
  }

  /** Volver al selector de doctores desde un doctor sin turnos (CLI-142). */
  protected onChangeDoctor(): void {
    this.selectedDoctorId.set(null);
    this.slotsByDate.set({});
    this.step.set('doctor');
    // Si llegamos desde la landing con el doctor ya elegido, la lista nunca se cargó.
    if (this.doctors().length === 0) {
      void this.loadDoctors();
    }
  }

  private async loadAvailability(doctorId: string): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const result = await firstValueFrom(this.bookingService.getAvailabilityRange(todayIso(), doctorId));
      this.slotsByDate.set(result.slotsByDate);
    } catch {
      this.slotsByDate.set({});
      this.error.set('No pudimos cargar los horarios disponibles. Intenta de nuevo.');
    } finally {
      this.loading.set(false);
    }
  }

  protected async onSlotSelected(slot: string): Promise<void> {
    const doctorId = this.selectedDoctorId();
    if (!doctorId) {
      return;
    }
    this.loading.set(true);
    this.error.set(null);
    try {
      const hold = await firstValueFrom(this.bookingService.holdSlot(slot, doctorId));
      this.appointmentId.set(hold.appointmentId);
      this.holdExpiresAt.set(hold.holdExpiresAt);
      this.step.set('contact');
    } catch (err) {
      if (isRateLimited(err)) {
        this.error.set(RATE_LIMIT_MESSAGE);
      } else if (err instanceof HttpErrorResponse && err.status === 409) {
        this.error.set('Ese horario ya no está disponible, elige otro.');
        this.step.set('slot');
        await this.loadAvailability(doctorId);
      } else {
        this.error.set('No pudimos reservar ese horario. Intenta de nuevo.');
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
      if (isRateLimited(err)) {
        this.error.set(RATE_LIMIT_MESSAGE);
      } else if (err instanceof HttpErrorResponse && err.status === 410) {
        this.error.set('El horario reservado ya venció. Elige uno nuevo.');
        this.resetToSlotSelection();
      } else if (err instanceof HttpErrorResponse && err.status === 409) {
        // 409 = el email/teléfono ya pertenece a una cuenta existente, o a
        // otra cita activa — el backend manda el motivo puntual en el
        // mensaje, mostrarlo tal cual en vez de un genérico.
        this.error.set(
          (err.error?.message as string | undefined) ??
            'Ese email o teléfono ya está en uso. Revisa tus datos.',
        );
      } else {
        this.error.set('No pudimos guardar tus datos. Intenta de nuevo.');
      }
    } finally {
      this.loading.set(false);
    }
  }

  protected onPaymentConfirmed(): void {
    this.step.set('confirmed');
  }

  protected onHoldExpired(): void {
    this.error.set('El tiempo para completar la reserva venció. Elige un horario nuevamente.');
    this.resetToSlotSelection();
  }

  private resetToSlotSelection(): void {
    const doctorId = this.selectedDoctorId();
    this.appointmentId.set(null);
    this.holdExpiresAt.set(null);
    this.step.set('slot');
    if (doctorId) {
      void this.loadAvailability(doctorId);
    }
  }
}
