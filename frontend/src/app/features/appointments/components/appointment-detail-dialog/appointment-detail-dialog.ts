import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  computed,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AppointmentsService } from '../../services/appointments.service';
import { ScrollLockService } from '../../../../shared/services/scroll-lock.service';
import type { AppointmentAgendaItem } from '../../models/appointment.model';
import { appointmentPatientLabel } from '../../models/appointment-patient-label';

const WHEN_FORMATTER = new Intl.DateTimeFormat('es-BO', {
  timeZone: 'America/La_Paz',
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  hour: '2-digit',
  minute: '2-digit',
});

const SOURCE_LABELS: Record<string, string> = {
  doctor: 'Agendada por el doctor',
  public_web: 'Consulta reservada por la web',
  whatsapp: 'Reservada por WhatsApp',
};

/**
 * Detalle de un turno propio en la agenda (CLI-151), con sus acciones: abrir
 * la ficha (lo que hacía el click antes), reprogramar (lo resuelve la agenda
 * con un click en el horario nuevo) y cancelar (con confirmación y motivo).
 * Una cita pasada solo permite abrir la ficha.
 */
@Component({
  selector: 'app-appointment-detail-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './appointment-detail-dialog.html',
  styleUrl: './appointment-detail-dialog.scss',
})
export class AppointmentDetailDialogComponent {
  private readonly appointmentsService = inject(AppointmentsService);
  private readonly scrollLock = inject(ScrollLockService);

  readonly appointment = input.required<AppointmentAgendaItem>();

  readonly openRecord = output<string>();
  readonly reschedule = output<AppointmentAgendaItem>();
  readonly cancelled = output<AppointmentAgendaItem>();
  readonly closed = output<void>();

  private readonly panel = viewChild<ElementRef<HTMLElement>>('panel');

  protected readonly patient = computed(() => appointmentPatientLabel(this.appointment()));
  protected readonly phone = computed(
    () => this.appointment().patientPhone ?? this.appointment().guestPhone,
  );
  protected readonly when = computed(() => {
    const text = WHEN_FORMATTER.format(new Date(this.appointment().appointmentDatetime));
    return `${text.charAt(0).toUpperCase()}${text.slice(1)} · ${this.appointment().durationMinutes} min`;
  });
  protected readonly origin = computed(() => SOURCE_LABELS[this.appointment().source] ?? 'Reserva');
  /** Solo una cita futura y confirmada se puede mover o cancelar. */
  protected readonly editable = computed(
    () =>
      this.appointment().status === 'confirmed' &&
      new Date(this.appointment().appointmentDatetime).getTime() > Date.now(),
  );

  /** Paso de confirmación de "Cancelar cita". */
  protected readonly confirmingCancel = signal(false);
  protected readonly reason = signal('');
  protected readonly cancelling = signal(false);
  protected readonly error = signal<string | null>(null);

  constructor() {
    this.scrollLock.lock();
    inject(DestroyRef).onDestroy(() => this.scrollLock.unlock());
    afterNextRender(() => this.panel()?.nativeElement.focus());
  }

  protected onOpenRecord(): void {
    const patientId = this.appointment().patientId;
    if (patientId) {
      this.openRecord.emit(patientId);
    }
  }

  protected onReschedule(): void {
    this.reschedule.emit(this.appointment());
  }

  protected askCancel(): void {
    this.confirmingCancel.set(true);
    this.error.set(null);
  }

  protected keepAppointment(): void {
    this.confirmingCancel.set(false);
    this.reason.set('');
  }

  protected onReasonInput(event: Event): void {
    this.reason.set((event.target as HTMLTextAreaElement).value);
  }

  protected async confirmCancel(): Promise<void> {
    if (this.cancelling()) {
      return;
    }
    this.cancelling.set(true);
    this.error.set(null);
    try {
      const cancelled = await firstValueFrom(
        this.appointmentsService.cancelByDoctor(
          this.appointment().id,
          this.reason().trim() || undefined,
        ),
      );
      this.cancelled.emit(cancelled);
    } catch {
      this.error.set('No pudimos cancelar la cita. Probá de nuevo.');
    } finally {
      this.cancelling.set(false);
    }
  }

  protected close(): void {
    this.closed.emit();
  }

  /** Cierra solo si el click cae en el fondo oscuro, no dentro del panel. */
  protected onBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.close();
    }
  }
}
