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

/**
 * Duración libre (CLI-194): de 5 minutos a 8 horas, de 5 en 5 — lo que acepta
 * el backend. Antes eran múltiplos de 30 hasta 4 h.
 */
export const STEP_MINUTES = 5;
export const MIN_DURATION = 5;
export const MAX_DURATION = 8 * 60;
const HOURS_OPTIONS = Array.from({ length: MAX_DURATION / 60 + 1 }, (_, i) => i);
const MINUTES_OPTIONS = Array.from({ length: 60 / STEP_MINUTES }, (_, i) => i * STEP_MINUTES);

/** Otra cita del día, en minutos desde la medianoche, para avisar si la nueva la pisa. */
export interface BusyInterval {
  readonly start: number;
  readonly end: number;
}
const SLOT_TAKEN = 'Ya tienes una cita en ese horario. Elige otro horario u otra duración.';

const LONG_DATE_FORMATTER = new Intl.DateTimeFormat('es-BO', {
  timeZone: 'America/La_Paz',
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});

/** Duración de un tratamiento o de una cita: de 5 en 5 hacia arriba, dentro de lo que se puede agendar (no a 30). */
function normalizeDuration(minutes: number): number {
  return Math.min(MAX_DURATION, Math.max(MIN_DURATION, Math.ceil(minutes / STEP_MINUTES) * STEP_MINUTES));
}

/** "HH:MM" → minutos desde la medianoche, o null si no es una hora válida. */
function hhmmToMinutes(value: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) {
    return null;
  }
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return hours < 24 && minutes < 60 ? hours * 60 + minutes : null;
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
  /** Las demás citas del doctor ese día — la nueva avisa (y no deja guardar) si pisa alguna. */
  readonly busyIntervals = input<readonly BusyInterval[]>([]);
  /**
   * CLI-151: con una cita, el modal la reprograma al horario clickeado en vez
   * de crear una nueva — paciente y tratamiento quedan fijos, duración y
   * notas arrancan con las de la cita.
   */
  readonly appointment = input<AppointmentAgendaItem | null>(null);
  /**
   * CLI-152: la próxima cita de un paciente recién atendido — arranca con su
   * paciente fijo y el tratamiento y la duración de la cita de origen.
   */
  readonly followUpOf = input<AppointmentAgendaItem | null>(null);

  readonly booked = output<AppointmentAgendaItem>();
  readonly closed = output<void>();

  private readonly panel = viewChild<ElementRef<HTMLElement>>('panel');

  protected readonly minDuration = MIN_DURATION;
  protected readonly hoursOptions = HOURS_OPTIONS;
  protected readonly minutesOptions = MINUTES_OPTIONS;

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
  /** Hora de inicio, en minutos desde la medianoche; arranca con la del horario clickeado y se puede cambiar de 5 en 5 (CLI-194). */
  protected readonly startMinutes = signal(0);
  protected readonly durationHours = computed(() => Math.floor(this.duration() / 60));
  protected readonly durationRemainder = computed(() => this.duration() % 60);
  protected readonly startHhmm = computed(() => minutesToHhmm(this.startMinutes()));
  protected readonly durationValid = computed(
    () => this.duration() >= MIN_DURATION && this.duration() <= MAX_DURATION,
  );
  protected readonly notes = signal('');
  protected readonly submitting = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly whenLabel = computed(() => {
    const { date } = this.slot();
    const minutes = this.startMinutes();
    const day = LONG_DATE_FORMATTER.format(new Date(clinicSlotIso(date, minutes)));
    return `${day.charAt(0).toUpperCase()}${day.slice(1)} · ${minutesToHhmm(minutes)} a ${minutesToHhmm(minutes + this.duration())}`;
  });

  protected readonly outsideSchedule = computed(() => {
    const { date } = this.slot();
    return !isWithinSchedule(this.schedule(), date, this.startMinutes(), this.duration());
  });

  /** La cita (hora de inicio y duración elegidas) pisa otra del doctor ese día; la primera que choque. */
  protected readonly conflict = computed<BusyInterval | null>(() => {
    const start = this.startMinutes();
    const end = start + this.duration();
    const hits = this.busyIntervals()
      .filter((b) => start < b.end && b.start < end)
      .sort((a, b) => a.start - b.start);
    return hits[0] ?? null;
  });

  protected readonly overlapsNext = computed(() => this.conflict() !== null);

  protected readonly nextBusyLabel = computed(() => {
    const conflict = this.conflict();
    return conflict === null ? '' : minutesToHhmm(conflict.start);
  });

  /** La cita no puede cruzar la medianoche: el día de la agenda es el mismo. */
  protected readonly crossesMidnight = computed(() => this.startMinutes() + this.duration() > 24 * 60);

  protected readonly isReschedule = computed(() => this.appointment() !== null);
  protected readonly appointmentPatient = computed(() => {
    const appointment = this.appointment() ?? this.followUpOf();
    return appointment ? appointmentPatientLabel(appointment) : '';
  });
  protected readonly title = computed(() => {
    if (this.isReschedule()) {
      return 'Reprogramar cita';
    }
    return this.followUpOf() ? 'Agendar próxima cita' : 'Agendar cita';
  });

  protected readonly canSubmit = computed(
    () =>
      (this.isReschedule() || !!this.patientId()) &&
      this.durationValid() &&
      !this.crossesMidnight() &&
      !this.overlapsNext() &&
      !this.submitting(),
  );

  constructor() {
    this.scrollLock.lock();
    inject(DestroyRef).onDestroy(() => this.scrollLock.unlock());
    afterNextRender(() => this.panel()?.nativeElement.focus());
  }

  ngOnInit(): void {
    this.startMinutes.set(this.slot().minutes);
    const appointment = this.appointment();
    if (appointment) {
      this.duration.set(normalizeDuration(appointment.durationMinutes));
      this.notes.set(appointment.notes ?? '');
      return;
    }
    const origin = this.followUpOf();
    if (origin) {
      this.patientId.set(origin.patientId);
      this.treatmentId.set(origin.treatmentId);
      this.duration.set(normalizeDuration(origin.durationMinutes));
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
      this.duration.set(normalizeDuration(treatment.estimatedMinutes));
    }
  }

  protected onDurationHoursChange(event: Event): void {
    const hours = Number((event.target as HTMLSelectElement).value);
    // Con 8 h no hay minutos: el máximo es 8 h en punto.
    this.duration.set(hours >= MAX_DURATION / 60 ? MAX_DURATION : hours * 60 + this.durationRemainder());
  }

  protected onDurationMinutesChange(event: Event): void {
    const minutes = Number((event.target as HTMLSelectElement).value);
    this.duration.set(Math.min(MAX_DURATION, this.durationHours() * 60 + minutes));
  }

  protected onStartChange(event: Event): void {
    const minutes = hhmmToMinutes((event.target as HTMLInputElement).value);
    if (minutes !== null) {
      this.startMinutes.set(minutes);
      this.error.set(null);
    }
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
          : (backendMessage(err) ?? 'No pudimos guardar la cita. Prueba de nuevo.'),
      );
    } finally {
      this.submitting.set(false);
    }
  }

  /** Crea la cita nueva, o mueve la existente al horario clickeado (CLI-151). */
  private save() {
    const { date } = this.slot();
    const appointmentDatetime = clinicSlotIso(date, this.startMinutes());
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
