import { Component, ChangeDetectionStrategy, computed, inject, input, output, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { BookingService } from '../../services/booking.service';

/** Sin teléfono del doctor, "Contactanos" cae al WhatsApp de la clínica. */
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
  /** Doctor elegido (CLI-166): a él va el botón "Contactanos". */
  readonly doctorName = input<string | null>(null);
  readonly doctorPhone = input<string | null>(null);
  readonly confirmed = output<void>();

  /**
   * WhatsApp con el doctor elegido y un mensaje listo — sin emojis, que
   * wa.me los corrompe. El número no se muestra: solo viaja en el enlace.
   */
  protected readonly contactHref = computed(() => {
    const phone = (this.doctorPhone() ?? CLINIC_PHONE).replace(/\D/g, '');
    const name = this.doctorName();
    const text = `Hola${name ? ` ${name}` : ''}, acabo de reservar una cita y quiero consultarte sobre mi pago.`;
    return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
  });
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
