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
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { catchError, firstValueFrom, forkJoin, map, of, switchMap } from 'rxjs';
import { AppointmentsService } from '../../services/appointments.service';
import { PatientsService } from '../../../patients/services/patients.service';
import { TreatmentsService } from '../../../treatments/services/treatments.service';
import { QuotesService } from '../../../quotes/services/quotes.service';
import { pendingPlanLines, type PlanLine } from '../../../quotes/utils/treatment-plan';
import { DiagnosesService } from '../../../diagnoses/services/diagnoses.service';
import { diagnosisSuggestions } from '../../../treatments/utils/diagnosis-suggestions';
import type { DentalExam } from '../../../patients/models/dental-exam.model';
import type { ToothProcedure } from '../../../treatments/models/treatment.model';
import { AuthService } from '../../../../auth/application/auth.service';
import { ScrollLockService } from '../../../../shared/services/scroll-lock.service';
import {
  CatalogPickerComponent,
  type CatalogPickerExtraGroup,
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

/** CLI-264: hora de inicio y duración elegidas para el paciente nuevo. */
export interface NewPatientSlot {
  readonly minutes: number;
  readonly durationMinutes: number;
}

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

/** CLI-263: prefijo de las opciones del selector que son un pendiente del presupuesto, no un tratamiento del catálogo. */
const PLAN_PREFIX = 'plan:';
/** CLI-266: prefijo de las opciones que sugiere el diagnóstico vigente. */
const DIAGNOSIS_PREFIX = 'diag:';

/** Lo que el doctor tiene a mano del paciente elegido para sugerirle qué agendar (CLI-263, CLI-266). */
interface PatientContext {
  readonly planLines: PlanLine[];
  readonly exam: DentalExam | null;
  readonly procedures: ToothProcedure[];
}
const EMPTY_CONTEXT: PatientContext = { planLines: [], exam: null, procedures: [] };

/** Un tratamiento sugerido (pendiente o por diagnóstico): qué tratamiento es y en qué piezas. */
interface SuggestionTarget {
  readonly treatmentId: string;
  readonly toothNumbers: readonly number[];
}

function teethLabel(teeth: readonly number[]): string {
  return `pieza${teeth.length === 1 ? '' : 's'} ${teeth.join(', ')}`;
}

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
  private readonly quotesService = inject(QuotesService);
  private readonly diagnosesService = inject(DiagnosesService);
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

  /**
   * CLI-264: el horario es de hoy y ya empezó — solo para un paciente que
   * llegó sin cita y se atiende ahora.
   */
  readonly walkIn = input(false);

  readonly booked = output<AppointmentAgendaItem>();
  /** CLI-264: registrar un paciente nuevo para este horario; la agenda abre su ficha y después le crea la cita. */
  readonly newPatient = output<NewPatientSlot>();
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

  /** CLI-266: los pacientes que el doctor atendió hace poco, primero; si falla, no hay atajo. */
  private readonly recentlyTreatedIds = toSignal(
    this.patientsService.getRecentlyTreatedIds().pipe(catchError(() => of([] as string[]))),
    { initialValue: [] as string[] },
  );
  protected readonly patientShortcuts = computed<CatalogPickerExtraGroup[]>(() => [
    { id: 'recent', label: 'Atendidos recientemente', itemIds: this.recentlyTreatedIds() },
  ]);

  /** Qué tratamientos sugiere cada diagnóstico (CLI-119), por código. */
  private readonly suggestedByCode = toSignal(
    this.diagnosesService.getCatalog().pipe(
      map((categories) => new Map(categories.flatMap((c) => c.diagnoses).map((d) => [d.code, d.suggestedTreatmentIds ?? []]))),
      catchError(() => of(new Map<string, string[]>())),
    ),
    { initialValue: new Map<string, string[]>() },
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

  protected readonly patientId = signal<string | null>(null);
  protected readonly treatmentId = signal<string | null>(null);
  /** Lo elegido en el selector: un tratamiento del catálogo o un pendiente del presupuesto (`plan:<línea>`). */
  protected readonly treatmentChoice = signal<string | null>(null);

  /**
   * Del paciente elegido: lo que tiene por realizar en sus presupuestos
   * (CLI-263) y su diagnóstico vigente con lo ya tratado (CLI-266). Son una
   * ayuda: lo que no se pueda cargar queda vacío y sigue el catálogo.
   */
  private readonly patientContext = toSignal(
    toObservable(this.patientId).pipe(
      switchMap((id) =>
        id
          ? forkJoin({
              planLines: this.quotesService.getByPatient(id).pipe(
                map(pendingPlanLines),
                catchError(() => of([] as PlanLine[])),
              ),
              exam: this.patientsService.getCurrentDentalExam(id).pipe(catchError(() => of(null))),
              procedures: this.treatmentsService.getToothProcedures(id).pipe(
                catchError(() => of([] as ToothProcedure[])),
              ),
            })
          : of(EMPTY_CONTEXT),
      ),
    ),
    { initialValue: EMPTY_CONTEXT },
  );

  private readonly planLines = computed(() => this.patientContext().planLines);

  private readonly diagnosisSuggestions = computed(() => {
    const { exam, procedures, planLines } = this.patientContext();
    return diagnosisSuggestions(exam, this.suggestedByCode(), procedures, planLines);
  });

  /** Opción del selector → tratamiento y piezas, para los pendientes y las sugerencias. */
  private readonly suggestionTargets = computed(() => {
    const targets = new Map<string, SuggestionTarget>();
    for (const line of this.planLines()) {
      targets.set(`${PLAN_PREFIX}${line.key}`, line);
    }
    for (const suggestion of this.diagnosisSuggestions()) {
      targets.set(`${DIAGNOSIS_PREFIX}${suggestion.key}`, suggestion);
    }
    return targets;
  });

  protected readonly treatmentOptions = computed<CatalogPickerItem[]>(() => {
    const catalog = this.treatments() ?? [];
    const byId = new Map(catalog.map((t) => [t.id, t]));
    const pending = this.planLines().map((line) => {
      const treatment = byId.get(line.treatmentId);
      return {
        id: `${PLAN_PREFIX}${line.key}`,
        label:
          line.toothNumbers.length > 0
            ? `${line.treatmentName} · ${teethLabel(line.toothNumbers)}`
            : line.treatmentName,
        groupId: 'plan',
        groupLabel: 'Del presupuesto',
        color: treatment?.categoryColor,
        hint: treatment ? `${treatment.estimatedMinutes} min` : undefined,
      };
    });
    // Solo tratamientos activos del catálogo.
    const suggested = this.diagnosisSuggestions().flatMap((suggestion) => {
      const treatment = byId.get(suggestion.treatmentId);
      if (!treatment) {
        return [];
      }
      const teeth = suggestion.toothNumbers.length > 0 ? ` · ${teethLabel(suggestion.toothNumbers)}` : '';
      return [{
        id: `${DIAGNOSIS_PREFIX}${suggestion.key}`,
        label: `${treatment.name}${teeth} (${suggestion.diagnosisNames.join(', ').toLowerCase()})`,
        groupId: 'diagnosis',
        groupLabel: 'Según su diagnóstico',
        color: treatment.categoryColor,
        hint: `${treatment.estimatedMinutes} min`,
      }];
    });
    return [
      ...pending,
      ...suggested,
      ...catalog.map((t) => ({
        id: t.id,
        label: t.name,
        groupId: t.categoryCode,
        groupLabel: t.categoryName,
        color: t.categoryColor,
        hint: `${t.estimatedMinutes} min`,
      })),
    ];
  });

  /** CLI-266: primero lo del presupuesto y después lo que pide el diagnóstico. */
  protected readonly treatmentShortcuts = computed<CatalogPickerExtraGroup[]>(() => {
    const ids = (group: string) =>
      this.treatmentOptions().filter((o) => o.groupId === group).map((o) => o.id);
    return [
      { id: 'plan', label: 'Del presupuesto', itemIds: ids('plan') },
      { id: 'diagnosis', label: 'Según su diagnóstico', itemIds: ids('diagnosis') },
    ];
  });

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
    if (this.followUpOf()) {
      return 'Agendar próxima cita';
    }
    return this.walkIn() ? 'Paciente sin cita' : 'Agendar cita';
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
      this.treatmentChoice.set(origin.treatmentId);
      this.duration.set(normalizeDuration(origin.durationMinutes));
    }
  }

  protected onPatientChange(id: string): void {
    if (id !== this.patientId() && this.suggestionTargets().has(this.treatmentChoice() ?? '')) {
      // El pendiente o la sugerencia era del paciente anterior.
      this.treatmentChoice.set(null);
      this.treatmentId.set(null);
    }
    this.patientId.set(id);
    this.error.set(null);
  }

  /** CLI-264: no hay ficha todavía; se registra y la cita se crea al terminar. */
  protected onNewPatient(): void {
    if (this.crossesMidnight() || this.overlapsNext() || !this.durationValid()) {
      return;
    }
    this.newPatient.emit({ minutes: this.startMinutes(), durationMinutes: this.duration() });
  }

  protected onTreatmentChange(id: string): void {
    this.treatmentChoice.set(id);
    const line = this.suggestionTargets().get(id);
    const treatmentId = line ? line.treatmentId : id;
    this.treatmentId.set(treatmentId);
    const treatment = this.treatments()?.find((t) => t.id === treatmentId);
    if (treatment) {
      this.duration.set(normalizeDuration(treatment.estimatedMinutes));
    }
    // Un pendiente o una sugerencia en piezas concretas las deja anotadas, si no hay notas todavía.
    if (line && line.toothNumbers.length > 0 && !this.notes().trim()) {
      const teeth = teethLabel(line.toothNumbers);
      this.notes.set(teeth.charAt(0).toUpperCase() + teeth.slice(1));
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
      ...(this.walkIn() && { walkIn: true }),
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
