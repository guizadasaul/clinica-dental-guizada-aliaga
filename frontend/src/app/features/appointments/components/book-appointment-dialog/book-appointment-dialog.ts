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
  type OnInit,
  signal,
  viewChild,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { catchError, firstValueFrom, map, of } from 'rxjs';
import { AppointmentsService } from '../../services/appointments.service';
import { PatientsService } from '../../../patients/services/patients.service';
import { TreatmentsService } from '../../../treatments/services/treatments.service';
import { AuthService } from '../../../../auth/application/auth.service';
import { ScrollLockService } from '../../../../shared/services/scroll-lock.service';
import {
  CatalogPickerComponent,
  type CatalogPickerItem,
} from '../../../../shared/ui/catalog-picker/catalog-picker';
import type { AppointmentAgendaItem, DoctorScheduleBlock } from '../../models/appointment.model';
import { appointmentPatientLabel } from '../../models/appointment-patient-label';
import { clinicSlotIso, isWithinSchedule, minutesToHhmm } from '../../models/clinic-schedule.util';

/** Horario clickeado en la grilla: día de Bolivia + minutos desde la medianoche. */
export interface AgendaSlot {
  readonly date: string;
  readonly minutes: number;
}

/** Duraciones que acepta el backend (CLI-148): múltiplos de 30 min, hasta 4 h. */
const DURATIONS = [30, 60, 90, 120, 150, 180, 210, 240];
const MAX_DURATION = DURATIONS.at(-1)!;
const SLOT_TAKEN = 'Ya tenés una cita en ese horario. Elegí otro horario u otra duración.';

const LONG_DATE_FORMATTER = new Intl.DateTimeFormat('es-BO', {
  timeZone: 'America/La_Paz',
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});

/** Duración del tratamiento redondeada hacia arriba a la grilla de 30 min, dentro de lo que se puede agendar. */
function durationForTreatment(estimatedMinutes: number): number {
  return Math.min(MAX_DURATION, Math.max(30, Math.ceil(estimatedMinutes / 30) * 30));
}

/** `message` del cuerpo de un error HTTP (string o string[] de class-validator), si trae algo usable. */
function backendMessage(err: unknown): string | null {
  const body = (err as { error?: { message?: unknown } } | null)?.error;
  const message = body?.message;
  if (typeof message === 'string') {
    return message;
  }
  if (Array.isArray(message) && typeof message[0] === 'string') {
    return message[0];
  }
  return null;
}

/**
 * Confirmación de una cita agendada por el doctor desde "Mi agenda" (CLI-150):
 * el día y la hora los define el horario clickeado en la grilla, acá solo se
 * elige paciente, tratamiento, duración y notas.
 */
@Component({
  selector: 'app-book-appointment-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CatalogPickerComponent],
  templateUrl: './book-appointment-dialog.html',
  styleUrl: './book-appointment-dialog.scss',
})
export class BookAppointmentDialogComponent implements OnInit {
  private readonly appointmentsService = inject(AppointmentsService);
  private readonly patientsService = inject(PatientsService);
  private readonly treatmentsService = inject(TreatmentsService);
  private readonly authService = inject(AuthService);
  private readonly scrollLock = inject(ScrollLockService);

  readonly slot = input.required<AgendaSlot>();
  /** Horario de atención del doctor — para avisar si el turno queda fuera. */
  readonly schedule = input<readonly DoctorScheduleBlock[]>([]);
  /** Minutos del día en que empieza la próxima cita del doctor, si hay — una duración más larga la pisaría. */
  readonly nextBusyMinutes = input<number | null>(null);
  /**
   * CLI-151: con una cita, el modal la reprograma al horario clickeado en vez
   * de crear una nueva — paciente y tratamiento quedan fijos, duración y
   * notas arrancan con las de la cita.
   */
  readonly appointment = input<AppointmentAgendaItem | null>(null);

  readonly booked = output<AppointmentAgendaItem>();
  readonly closed = output<void>();

  private readonly panel = viewChild<ElementRef<HTMLElement>>('panel');

  protected readonly durations = DURATIONS;

  private readonly patients = toSignal(
    this.patientsService.getAll().pipe(catchError(() => of(null))),
    { initialValue: undefined },
  );
  private readonly treatments = toSignal(
    this.treatmentsService.getAll().pipe(
      map((list) => list.filter((t) => t.isActive)),
      catchError(() => of([])),
    ),
    { initialValue: undefined },
  );

  protected readonly patientsLoading = computed(() => this.patients() === undefined);
  protected readonly patientsFailed = computed(() => this.patients() === null);
  protected readonly treatmentsLoading = computed(() => this.treatments() === undefined);

  protected readonly patientOptions = computed<CatalogPickerItem[]>(() => {
    const me = this.authService.currentUser()?.id ?? null;
    return (this.patients() ?? [])
      .flatMap((p) => (p.patient ? [p.patient] : []))
      .map((p) => {
        const mine = p.assignedDoctorId !== null && p.assignedDoctorId === me;
        const name = [p.firstName, p.lastNamePaternal, p.lastNameMaternal]
          .filter(Boolean)
          .join(' ');
        return {
          id: p.id,
          label: p.dni ? `${name} · ${p.dni}` : name,
          groupId: mine ? 'mine' : 'others',
          groupLabel: mine ? 'Mis pacientes' : 'Otros pacientes',
        };
      })
      .sort((a, b) => a.label.localeCompare(b.label, 'es'));
  });

  protected readonly treatmentOptions = computed<CatalogPickerItem[]>(() =>
    (this.treatments() ?? []).map((t) => ({
      id: t.id,
      label: t.name,
      groupId: t.categoryCode,
      groupLabel: t.categoryName,
      color: t.categoryColor,
      hint: `${t.estimatedMinutes} min`,
    })),
  );

  protected readonly patientId = signal<string | null>(null);
  protected readonly treatmentId = signal<string | null>(null);
  protected readonly duration = signal(30);
  protected readonly notes = signal('');
  protected readonly submitting = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly whenLabel = computed(() => {
    const { date, minutes } = this.slot();
    const day = LONG_DATE_FORMATTER.format(new Date(clinicSlotIso(date, minutes)));
    return `${day.charAt(0).toUpperCase()}${day.slice(1)} · ${minutesToHhmm(minutes)} a ${minutesToHhmm(minutes + this.duration())}`;
  });

  protected readonly outsideSchedule = computed(() => {
    const { date, minutes } = this.slot();
    return !isWithinSchedule(this.schedule(), date, minutes, this.duration());
  });

  /** La duración elegida alcanza a la próxima cita del doctor ese día. */
  protected readonly overlapsNext = computed(() => {
    const next = this.nextBusyMinutes();
    return next !== null && this.slot().minutes + this.duration() > next;
  });

  protected readonly nextBusyLabel = computed(() => {
    const next = this.nextBusyMinutes();
    return next === null ? '' : minutesToHhmm(next);
  });

  protected readonly isReschedule = computed(() => this.appointment() !== null);
  protected readonly appointmentPatient = computed(() => {
    const appointment = this.appointment();
    return appointment ? appointmentPatientLabel(appointment) : '';
  });

  protected readonly canSubmit = computed(
    () => (this.isReschedule() || !!this.patientId()) && !this.overlapsNext() && !this.submitting(),
  );

  constructor() {
    this.scrollLock.lock();
    inject(DestroyRef).onDestroy(() => this.scrollLock.unlock());
    afterNextRender(() => this.panel()?.nativeElement.focus());
  }

  ngOnInit(): void {
    const appointment = this.appointment();
    if (appointment) {
      this.duration.set(
        DURATIONS.includes(appointment.durationMinutes)
          ? appointment.durationMinutes
          : durationForTreatment(appointment.durationMinutes),
      );
      this.notes.set(appointment.notes ?? '');
    }
  }

  protected onPatientChange(id: string): void {
    this.patientId.set(id);
    this.error.set(null);
  }

  protected onTreatmentChange(id: string): void {
    this.treatmentId.set(id);
    const treatment = this.treatments()?.find((t) => t.id === id);
    if (treatment) {
      this.duration.set(durationForTreatment(treatment.estimatedMinutes));
    }
  }

  protected onDurationChange(event: Event): void {
    this.duration.set(Number((event.target as HTMLSelectElement).value));
  }

  protected onNotesInput(event: Event): void {
    this.notes.set((event.target as HTMLTextAreaElement).value);
  }

  protected async onSubmit(): Promise<void> {
    if (!this.canSubmit()) {
      return;
    }
    this.submitting.set(true);
    this.error.set(null);
    try {
      this.booked.emit(await firstValueFrom(this.save()));
    } catch (err) {
      const status = (err as { status?: number } | null)?.status;
      this.error.set(
        status === 409
          ? (backendMessage(err) ?? SLOT_TAKEN)
          : (backendMessage(err) ?? 'No pudimos guardar la cita. Probá de nuevo.'),
      );
    } finally {
      this.submitting.set(false);
    }
  }

  /** Crea la cita nueva, o mueve la existente al horario clickeado (CLI-151). */
  private save() {
    const { date, minutes } = this.slot();
    const appointmentDatetime = clinicSlotIso(date, minutes);
    const appointment = this.appointment();
    if (appointment) {
      return this.appointmentsService.rescheduleByDoctor(appointment.id, {
        appointmentDatetime,
        durationMinutes: this.duration(),
        notes: this.notes().trim(),
      });
    }
    return this.appointmentsService.createByDoctor({
      patientId: this.patientId()!,
      appointmentDatetime,
      treatmentId: this.treatmentId() ?? undefined,
      durationMinutes: this.duration(),
      notes: this.notes().trim() || undefined,
    });
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
