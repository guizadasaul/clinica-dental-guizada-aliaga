import {
  Component,
  ChangeDetectionStrategy,
  inject,
  input,
  signal,
  computed,
  effect,
  untracked,
  DestroyRef,
  ElementRef,
  HostListener,
  Injector,
  afterNextRender,
  viewChild,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { firstValueFrom } from 'rxjs';
import { AppointmentsService } from '../../services/appointments.service';
import { AuthService } from '../../../../auth/application/auth.service';
import { FALLBACK_DOCTOR_COLOR } from '../../../../shared/constants/doctor-colors';
import { PatientWizardComponent } from '../../../patients/components/patient-wizard/patient-wizard';
import type {
  AppointmentAgendaItem,
  DoctorScheduleBlock,
  TimeBlock,
} from '../../models/appointment.model';
import { isWithinSchedule, minutesToHhmm } from '../../models/clinic-schedule.util';
import {
  BookAppointmentDialogComponent,
  type AgendaSlot,
  type BusyInterval,
} from '../book-appointment-dialog/book-appointment-dialog';
import { TimeBlockDialogComponent } from '../time-block-dialog/time-block-dialog';
import { AppointmentDetailDialogComponent } from '../appointment-detail-dialog/appointment-detail-dialog';
import { appointmentPatientLabel } from '../../models/appointment-patient-label';
import { PageHeaderComponent } from '../../../../shared/ui/page-header/page-header';

const TIME_FORMATTER = new Intl.DateTimeFormat('es-BO', {
  timeZone: 'America/La_Paz',
  hour: '2-digit',
  minute: '2-digit',
});

const HOUR_MINUTE_FORMATTER = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/La_Paz',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

const WEEKDAY_SHORT_FORMATTER = new Intl.DateTimeFormat('es-BO', {
  timeZone: 'America/La_Paz',
  weekday: 'short',
});

const WEEKDAY_INDEX_FORMATTER = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/La_Paz',
  weekday: 'short',
});

// 0 = domingo, ..., 6 = sábado — igual numeración que Date#getDay.
const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

const MONTH_FORMATTER = new Intl.DateTimeFormat('es-BO', {
  timeZone: 'America/La_Paz',
  month: 'long',
});

function laPazDateString(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/La_Paz' }).format(date);
}

function laPazHourMinute(iso: string): { hour: number; minute: number } {
  const parts = HOUR_MINUTE_FORMATTER.formatToParts(new Date(iso));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '0';
  const hour = Number(get('hour'));
  return { hour: hour === 24 ? 0 : hour, minute: Number(get('minute')) };
}

// Bolivia es UTC-4 fijo, sin horario de verano — sumar días de calendario en
// UTC es seguro (mismo truco que usa el backend, api/src/appointments).
function addDaysToDateString(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number);
  const next = new Date(Date.UTC(year, month - 1, day));
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).replace(/\.$/, '');
}

function laPazWeekdayIndex(dateStr: string): number {
  const label = WEEKDAY_INDEX_FORMATTER.format(new Date(`${dateStr}T12:00:00-04:00`));
  return WEEKDAY_INDEX[label] ?? 0;
}

/** Lunes de la semana (Bolivia) a la que pertenece `dateStr`. */
function mondayOf(dateStr: string): string {
  const weekday = laPazWeekdayIndex(dateStr);
  const offsetFromMonday = weekday === 0 ? -6 : 1 - weekday;
  return addDaysToDateString(dateStr, offsetFromMonday);
}

interface WeekendPart {
  readonly date: string;
  readonly weekday: string;
  readonly dayNum: string;
  readonly isToday: boolean;
}

interface DayHeader {
  readonly date: string;
  readonly weekday: string;
  readonly dayNum: string;
  readonly isToday: boolean;
  readonly isWeekend: boolean;
  readonly weekendSecond?: WeekendPart;
}

interface HourMark {
  readonly label: string;
  readonly offset: number;
}

interface GridLine {
  readonly offset: number;
  readonly isHour: boolean;
}

interface SlotLabel {
  readonly offset: number;
  readonly label: string;
  readonly isHour: boolean;
}

export type AgendaScope = 'mine' | 'all';

/** Carril de un turno dentro de su día: turnos que se pisan en el tiempo se reparten el ancho (CLI-110). */
interface SlotLane {
  readonly lane: number;
  readonly lanes: number;
}

/** Franja de 30 min de un día: clickeable para agendar si está libre y es futura (CLI-150). */
interface AgendaCell {
  readonly minutes: number;
  readonly offset: number;
  /** Fuera del horario de atención del doctor — se sombrea. */
  readonly offHours: boolean;
  readonly bookable: boolean;
  readonly label: string;
}

interface DoctorLegendItem {
  readonly id: string;
  readonly name: string;
  readonly color: string;
}

/**
 * Asigna carriles a los turnos de un mismo día: dos turnos que se solapan en
 * el tiempo nunca comparten carril, y todos los de un mismo grupo de
 * solapamiento usan el mismo ancho (el del grupo más ancho).
 */
function assignLanes(
  starts: readonly { id: string; start: number; duration: number }[],
): Map<string, SlotLane> {
  const sorted = [...starts].sort((a, b) => a.start - b.start || a.id.localeCompare(b.id));
  const result = new Map<string, SlotLane>();
  let group: { id: string; lane: number }[] = [];
  let laneEnds: number[] = [];
  let groupEnd = -Infinity;

  const flush = () => {
    for (const g of group) {
      result.set(g.id, { lane: g.lane, lanes: laneEnds.length });
    }
    group = [];
    laneEnds = [];
  };

  for (const s of sorted) {
    if (s.start >= groupEnd) {
      flush();
    }
    let lane = laneEnds.findIndex((end) => end <= s.start);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(0);
    }
    laneEnds[lane] = s.start + s.duration;
    groupEnd = Math.max(groupEnd, s.start + s.duration);
    group.push({ id: s.id, lane });
  }
  flush();
  return result;
}

@Component({
  selector: 'app-doctor-agenda',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    PageHeaderComponent,
    PatientWizardComponent,
    BookAppointmentDialogComponent,
    TimeBlockDialogComponent,
    AppointmentDetailDialogComponent,
    NgTemplateOutlet,
  ],
  templateUrl: './doctor-agenda.html',
  styleUrl: './doctor-agenda.scss',
})
export class DoctorAgendaComponent {
  private readonly appointmentsService = inject(AppointmentsService);
  private readonly authService = inject(AuthService);

  // CLI-64: cuando viene seteado (panel de admin), la agenda mostrada es la
  // de ESE doctor en vez de la del usuario logueado; readOnly apaga cualquier
  // acción de edición (hoy, abrir la ficha del paciente desde un turno).
  readonly doctorId = input<string | null>(null);
  readonly readOnly = input(false);
  /** CLI-110: fija la agenda común (panel de admin, "Todos los doctores") y oculta el selector. */
  readonly allDoctors = input(false);

  /** "Mi agenda" / "Agenda común" — solo lo elige el doctor en su propia agenda. */
  protected readonly scope = signal<AgendaScope>('mine');
  protected readonly effectiveScope = computed<AgendaScope>(() =>
    this.allDoctors() ? 'all' : this.scope(),
  );
  protected readonly showScopeToggle = computed(() => !this.readOnly() && !this.allDoctors());
  protected readonly title = computed(() => {
    if (this.effectiveScope() === 'all') {
      return 'Agenda común';
    }
    return this.readOnly() ? 'Agenda' : 'Mi agenda';
  });

  // Grilla horaria de 24 horas, de 00:00 a 24:00, en franjas de 30 min (igual
  // duración que reserva cada cita, ver SLOT_MINUTES en
  // api/src/appointments/domain/ClinicSchedule.ts). Se scrollea hacia arriba y
  // hacia abajo; al abrir arranca en las 09:00 (CLI-192).
  protected readonly GRID_START_HOUR = 0;
  protected readonly GRID_END_HOUR = 24;
  /** Hora a la que queda el scroll al abrir y al cambiar de semana. */
  protected readonly DEFAULT_SCROLL_HOUR = 9;
  protected readonly SLOT_MINUTES = 30;
  protected readonly ROW_HEIGHT_PX = 40;
  protected readonly totalSlots =
    ((this.GRID_END_HOUR - this.GRID_START_HOUR) * 60) / this.SLOT_MINUTES;
  protected readonly gridHeightPx = this.totalSlots * this.ROW_HEIGHT_PX;
  /** Scroll (px) que deja la hora por defecto justo debajo del encabezado fijo. */
  protected readonly defaultScrollPx =
    ((this.DEFAULT_SCROLL_HOUR - this.GRID_START_HOUR) * 60 / this.SLOT_MINUTES) * this.ROW_HEIGHT_PX;

  protected readonly hourMarks: HourMark[] = Array.from(
    { length: this.GRID_END_HOUR - this.GRID_START_HOUR + 1 },
    (_, i) => ({
      label: `${this.GRID_START_HOUR + i}:00`,
      offset: i * (60 / this.SLOT_MINUTES) * this.ROW_HEIGHT_PX,
    }),
  );

  protected readonly gridLines: GridLine[] = Array.from({ length: this.totalSlots }, (_, i) => ({
    offset: i * this.ROW_HEIGHT_PX,
    isHour: i % 2 === 0,
  }));

  // Sábado y domingo comparten una sexta columna (mismo ancho que el resto),
  // dividida horizontalmente por la mitad — cada mitad es un panel con la
  // misma escala 00:00–24:00 que el resto de la semana (para poder registrar
  // una emergencia a cualquier hora), con scroll vertical propio e
  // independiente entre sí. La columna queda fija a la vista (sticky) con el
  // alto del área visible de la grilla, partido entre los dos paneles por CSS
  // (CLI-192): con 24 horas ya no se puede igualar el alto de los demás días.

  protected readonly panelSlotLabels: SlotLabel[] = Array.from(
    { length: this.totalSlots },
    (_, i) => {
      const totalMinutes = i * this.SLOT_MINUTES;
      const hour = this.GRID_START_HOUR + Math.floor(totalMinutes / 60);
      const minute = totalMinutes % 60;
      return {
        offset: i * this.ROW_HEIGHT_PX,
        label: `${hour}:${minute === 0 ? '00' : minute}`,
        isHour: minute === 0,
      };
    },
  );

  protected readonly appointments = signal<AppointmentAgendaItem[]>([]);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly historyPatientId = signal<string | null>(null);

  /**
   * CLI-150: solo en la agenda propia del doctor (ni en la común, ni en la
   * vista de solo lectura del admin) se agenda haciendo click en un horario.
   */
  protected readonly canBook = computed(
    () =>
      this.effectiveScope() === 'mine' &&
      !this.readOnly() &&
      !this.allDoctors() &&
      !this.doctorId(),
  );
  /** Horario de atención del doctor — sombrea lo que queda fuera. */
  protected readonly schedule = signal<DoctorScheduleBlock[]>([]);
  /** CLI-195: horarios que el doctor apartó, de la semana visible. */
  protected readonly timeBlocks = signal<TimeBlock[]>([]);
  /** CLI-195: con valor, el diálogo de reservar horario está abierto (un horario existente o uno nuevo). */
  protected readonly blockDialog = signal<{ block: TimeBlock | null; date: string } | null>(null);
  /** Horario clickeado: con valor, el modal de "Agendar cita" está abierto. */
  protected readonly bookingSlot = signal<AgendaSlot | null>(null);
  /** CLI-151: turno propio clickeado — con valor, el detalle está abierto. */
  protected readonly detailAppointment = signal<AppointmentAgendaItem | null>(null);
  /** CLI-151: cita que se está reprogramando — la agenda espera el click en el horario nuevo. */
  protected readonly rescheduling = signal<AppointmentAgendaItem | null>(null);
  /** CLI-152: turno desde el que se abrió la ficha — al completarla se ofrece agendar la próxima cita. */
  private readonly historyOrigin = signal<AppointmentAgendaItem | null>(null);
  /** CLI-152: oferta "¿Agendar la próxima cita?", con la cita futura que el paciente ya tenga, si hay. */
  protected readonly followUpOffer = signal<{
    origin: AppointmentAgendaItem;
    upcoming: AppointmentAgendaItem | null;
  } | null>(null);
  /** CLI-152: próxima cita en curso — la agenda espera el click en el horario, con el paciente fijo. */
  protected readonly followUpPick = signal<AppointmentAgendaItem | null>(null);
  /** Esperando el click en un horario: para reprogramar o para la próxima cita. */
  protected readonly picking = computed(() => this.rescheduling() ?? this.followUpPick());
  /** Confirmación breve después de agendar. */
  protected readonly notice = signal<string | null>(null);
  private noticeTimer: ReturnType<typeof setTimeout> | undefined;

  // Semana completa (lunes a domingo), siempre — nunca arranca en el día
  // actual. Sábado y domingo comparten una sexta columna del mismo ancho
  // que el resto, partida horizontalmente en dos mini-grillas.
  protected readonly VIEW_DAYS = 7;
  protected readonly selectedDate = signal(mondayOf(laPazDateString(new Date())));

  protected readonly gridTemplateColumns = '56px repeat(6, minmax(140px, 1fr))';

  protected readonly visibleDates = computed(() =>
    Array.from({ length: this.VIEW_DAYS }, (_, i) => addDaysToDateString(this.selectedDate(), i)),
  );

  protected readonly dayHeaders = computed<DayHeader[]>(() => {
    const today = laPazDateString(new Date());
    const dates = this.visibleDates();
    const headers: DayHeader[] = dates.slice(0, 5).map((date) => ({
      date,
      ...this.dayHeaderParts(date),
      isToday: date === today,
      isWeekend: false,
    }));
    const saturday = dates[5];
    const sunday = dates[6];
    headers.push({
      date: saturday,
      ...this.dayHeaderParts(saturday),
      isToday: saturday === today,
      isWeekend: true,
      weekendSecond: {
        date: sunday,
        ...this.dayHeaderParts(sunday),
        isToday: sunday === today,
      },
    });
    return headers;
  });

  protected readonly isCurrentWeekVisible = computed(
    () => this.selectedDate() === mondayOf(laPazDateString(new Date())),
  );

  protected readonly rangeLabel = computed(() => {
    const dates = this.visibleDates();
    const first = this.dayHeaderParts(dates[0]);
    const lastDate = dates.at(-1)!;
    const last = this.dayHeaderParts(lastDate);
    const month = capitalize(MONTH_FORMATTER.format(new Date(`${lastDate}T12:00:00-04:00`)));
    return `${first.weekday} ${first.dayNum} – ${last.weekday} ${last.dayNum} de ${month}`;
  });

  protected readonly appointmentsByDate = computed(() => {
    const map = new Map<string, AppointmentAgendaItem[]>();
    const minMinutes = this.GRID_START_HOUR * 60;
    const maxMinutes = this.GRID_END_HOUR * 60;
    for (const appt of this.appointments()) {
      const { hour, minute } = laPazHourMinute(appt.appointmentDatetime);
      const minutes = hour * 60 + minute;
      if (minutes < minMinutes || minutes >= maxMinutes) {
        continue;
      }
      const dateKey = laPazDateString(new Date(appt.appointmentDatetime));
      const bucket = map.get(dateKey) ?? [];
      bucket.push(appt);
      map.set(dateKey, bucket);
    }
    return map;
  });

  /** Doctores con turnos en la semana visible — leyenda de la agenda común. */
  protected readonly doctorLegend = computed<DoctorLegendItem[]>(() => {
    const byId = new Map<string, DoctorLegendItem>();
    for (const a of this.appointments()) {
      if (!byId.has(a.doctorId)) {
        byId.set(a.doctorId, {
          id: a.doctorId,
          name: a.doctorName ?? 'Doctor',
          color: a.doctorColor ?? FALLBACK_DOCTOR_COLOR,
        });
      }
    }
    return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
  });

  /** Carril de cada turno dentro de su día (solo hay solapamientos en la agenda común). */
  protected readonly lanesById = computed(() => {
    const lanes = new Map<string, SlotLane>();
    for (const appts of this.appointmentsByDate().values()) {
      const starts = appts.map((a) => {
        const { hour, minute } = laPazHourMinute(a.appointmentDatetime);
        return { id: a.id, start: hour * 60 + minute, duration: this.durationOf(a) };
      });
      for (const [id, lane] of assignLanes(starts)) {
        lanes.set(id, lane);
      }
    }
    return lanes;
  });

  /** CLI-195: los horarios apartados, recortados a cada día visible (minutos desde las 00:00). */
  protected readonly blockSegmentsByDate = computed(() => {
    const result = new Map<string, { block: TimeBlock; start: number; end: number }[]>();
    for (const date of this.visibleDates()) {
      const dayStart = new Date(`${date}T00:00:00-04:00`).getTime();
      const segments: { block: TimeBlock; start: number; end: number }[] = [];
      for (const block of this.timeBlocks()) {
        const start = Math.max(0, (new Date(block.startsAt).getTime() - dayStart) / 60000);
        const end = Math.min(1440, (new Date(block.endsAt).getTime() - dayStart) / 60000);
        if (end > start) {
          segments.push({ block, start, end });
        }
      }
      result.set(date, segments);
    }
    return result;
  });

  /** Franjas de cada día visible, con qué está libre para agendar y qué cae fuera de horario. */
  protected readonly cellsByDate = computed(() => {
    const cells = new Map<string, AgendaCell[]>();
    if (!this.canBook()) {
      return cells;
    }
    const now = Date.now();
    const schedule = this.schedule();
    for (const date of this.visibleDates()) {
      const movingId = this.rescheduling()?.id;
      const busy = this.appointmentsFor(date)
        .filter((a) => a.id !== movingId)
        .map((a) => {
        const { hour, minute } = laPazHourMinute(a.appointmentDatetime);
        const start = hour * 60 + minute;
        return { start, end: start + this.durationOf(a) };
      });
      const blocked = this.blockSegmentsByDate().get(date) ?? [];
      const dayCells: AgendaCell[] = [];
      for (let i = 0; i < this.totalSlots; i++) {
        const minutes = this.GRID_START_HOUR * 60 + i * this.SLOT_MINUTES;
        const occupied =
          busy.some((b) => b.start < minutes + this.SLOT_MINUTES && minutes < b.end) ||
          blocked.some((b) => b.start < minutes + this.SLOT_MINUTES && minutes < b.end);
        const past = new Date(`${date}T${minutesToHhmm(minutes)}:00-04:00`).getTime() <= now;
        dayCells.push({
          minutes,
          offset: i * this.ROW_HEIGHT_PX,
          offHours:
            schedule.length > 0 && !isWithinSchedule(schedule, date, minutes, this.SLOT_MINUTES),
          bookable: !occupied && !past,
          label: `Agendar el ${this.dayLabel(date)} a las ${minutesToHhmm(minutes)}`,
        });
      }
      cells.set(date, dayCells);
    }
    return cells;
  });

  /**
   * Las demás citas del día del horario elegido, como intervalos en minutos
   * (CLI-194): el modal deja elegir la hora de inicio y la duración, y avisa si
   * pisan alguna. La que se está reprogramando no cuenta.
   */
  protected readonly busyIntervals = computed<BusyInterval[]>(() => {
    const slot = this.bookingSlot();
    if (!slot) {
      return [];
    }
    const movingId = this.rescheduling()?.id;
    const appointments = this.appointmentsFor(slot.date)
      .filter((a) => a.id !== movingId)
      .map((a) => {
        const { hour, minute } = laPazHourMinute(a.appointmentDatetime);
        const start = hour * 60 + minute;
        return { start, end: start + this.durationOf(a) };
      });
    const blocks = (this.blockSegmentsByDate().get(slot.date) ?? []).map((b) => ({
      start: b.start,
      end: b.end,
    }));
    return [...appointments, ...blocks];
  });

  private readonly injector = inject(Injector);
  private readonly gridRef = viewChild<ElementRef<HTMLElement>>('grid');

  constructor() {
    // Al abrir la agenda y al cambiar de semana, la vista queda en las 09:00
    // (la grilla es de 24 horas). La grilla solo existe tras cargar; el efecto
    // vuelve a correr cuando aparece y cuando cambian los días visibles.
    effect(() => {
      const grid = this.gridRef();
      this.visibleDates();
      if (!grid) {
        return;
      }
      afterNextRender(() => this.scrollToDefaultHour(grid.nativeElement), {
        injector: this.injector,
      });
    });
    // Reactivo a doctorId (no a selectedDate, que ya dispara su propio
    // reload explícito desde onPrevPage/onNextPage/onToday) — cambia cuando
    // el admin elige otro doctor desde el panel sin desmontar el componente.
    effect(
      () => {
        this.doctorId();
        this.effectiveScope();
        untracked(() => void this.load());
      },
      { allowSignalWrites: true },
    );
    inject(DestroyRef).onDestroy(() => clearTimeout(this.noticeTimer));
    effect(
      () => {
        if (this.canBook()) {
          untracked(() => void this.loadSchedule());
        }
      },
      { allowSignalWrites: true },
    );
  }

  /** Pone el scroll de la grilla (y el de cada panel de fin de semana) en la hora por defecto. */
  private scrollToDefaultHour(grid: HTMLElement): void {
    grid.scrollTop = this.defaultScrollPx;
    grid.querySelectorAll<HTMLElement>('.agenda-mini-panel').forEach((panel) => {
      panel.scrollTop = this.defaultScrollPx;
    });
  }

  /** Sin horario cargado solo no se sombrea nada — agendar sigue funcionando. */
  private async loadSchedule(): Promise<void> {
    if (this.schedule().length > 0) {
      return;
    }
    try {
      this.schedule.set(await firstValueFrom(this.appointmentsService.getMySchedule()));
    } catch {
      this.schedule.set([]);
    }
  }

  private dayLabel(date: string): string {
    const { weekday, dayNum } = this.dayHeaderParts(date);
    return `${weekday.toLowerCase()} ${dayNum}`;
  }

  /** Duración real del turno — una cita vieja sin el dato ocupa una franja. */
  protected durationOf(a: AppointmentAgendaItem): number {
    return a.durationMinutes > 0 ? a.durationMinutes : this.SLOT_MINUTES;
  }

  protected apptHeightPx(a: AppointmentAgendaItem): number {
    return (this.durationOf(a) / this.SLOT_MINUTES) * this.ROW_HEIGHT_PX;
  }

  protected cellsFor(date: string): AgendaCell[] {
    return this.cellsByDate().get(date) ?? [];
  }

  protected onBookSlot(date: string, cell: AgendaCell): void {
    if (!this.canBook() || !cell.bookable) {
      return;
    }
    this.bookingSlot.set({ date, minutes: cell.minutes });
  }

  protected onBookingClosed(): void {
    this.bookingSlot.set(null);
  }

  protected onBooked(saved: AppointmentAgendaItem): void {
    const verb = this.rescheduling() ? 'reprogramada' : 'agendada';
    this.bookingSlot.set(null);
    this.onStopPicking();
    this.showNotice(
      `Cita ${verb}: ${this.patientLabel(saved)} · ${this.dayLabelOf(saved.appointmentDatetime)} ${this.formatDatetime(saved.appointmentDatetime)}`,
    );
    void this.load();
  }

  private dayLabelOf(iso: string): string {
    return this.dayLabel(laPazDateString(new Date(iso)));
  }

  protected onDetailClosed(): void {
    this.detailAppointment.set(null);
  }

  protected onOpenRecord(patientId: string): void {
    this.historyOrigin.set(this.detailAppointment());
    this.detailAppointment.set(null);
    this.historyPatientId.set(patientId);
  }

  /** "Reprogramar": la agenda propia pasa a esperar el click en el horario nuevo. */
  protected onStartReschedule(appointment: AppointmentAgendaItem): void {
    this.detailAppointment.set(null);
    this.scope.set('mine');
    this.rescheduling.set(appointment);
  }

  protected onStopPicking(): void {
    this.rescheduling.set(null);
    this.followUpPick.set(null);
  }

  protected onCancelled(cancelled: AppointmentAgendaItem): void {
    this.detailAppointment.set(null);
    this.showNotice(`Cita cancelada: ${this.patientLabel(cancelled)}`);
    void this.load();
  }

  /** Esc sale del modo "elegí el nuevo horario" (con un modal abierto, Esc cierra el modal). */
  @HostListener('document:keydown.escape')
  protected onEscape(): void {
    if (this.picking() && !this.bookingSlot() && !this.detailAppointment()) {
      this.onStopPicking();
    }
  }

  private showNotice(text: string): void {
    this.notice.set(text);
    clearTimeout(this.noticeTimer);
    this.noticeTimer = setTimeout(() => this.notice.set(null), 5000);
  }

  private dayHeaderParts(dateStr: string): { weekday: string; dayNum: string } {
    const d = new Date(`${dateStr}T12:00:00-04:00`);
    return {
      weekday: capitalize(WEEKDAY_SHORT_FORMATTER.format(d)),
      dayNum: String(Number(dateStr.split('-')[2])),
    };
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const from = this.selectedDate();
      const to = addDaysToDateString(from, this.VIEW_DAYS);
      // Aparte de las citas: no demora ni rompe la carga de la agenda.
      void this.loadTimeBlocks(from, to);
      const result = await firstValueFrom(
        this.appointmentsService.getAgenda({
          status: 'confirmed',
          from,
          to,
          doctorId: this.doctorId() ?? undefined,
          scope: this.effectiveScope() === 'all' ? 'all' : undefined,
        }),
      );
      this.appointments.set(result);
    } catch {
      this.error.set('No pudimos cargar la agenda.');
    } finally {
      this.loading.set(false);
    }
  }

  /** CLI-195: solo en la agenda propia; si falla, la agenda se ve igual (el backend igual los respeta). */
  private async loadTimeBlocks(from: string, to: string): Promise<void> {
    if (!this.canBook()) {
      this.timeBlocks.set([]);
      return;
    }
    try {
      this.timeBlocks.set(await firstValueFrom(this.appointmentsService.getTimeBlocks(from, to)));
    } catch {
      this.timeBlocks.set([]);
    }
  }

  protected blockTopPx(start: number): number {
    return ((start - this.GRID_START_HOUR * 60) / this.SLOT_MINUTES) * this.ROW_HEIGHT_PX;
  }

  protected blockHeightPx(start: number, end: number): number {
    return ((end - start) / this.SLOT_MINUTES) * this.ROW_HEIGHT_PX;
  }

  protected blocksFor(date: string) {
    return this.blockSegmentsByDate().get(date) ?? [];
  }

  protected onNewBlock(): void {
    this.blockDialog.set({ block: null, date: this.selectedDate() });
  }

  protected onOpenBlock(block: TimeBlock, date: string): void {
    this.blockDialog.set({ block, date });
  }

  protected onBlockClosed(): void {
    this.blockDialog.set(null);
  }

  protected onBlockSaved(): void {
    this.blockDialog.set(null);
    this.showNotice('Horario reservado.');
    void this.load();
  }

  protected onBlockRemoved(): void {
    this.blockDialog.set(null);
    this.showNotice('Reserva quitada.');
    void this.load();
  }

  protected appointmentsFor(date: string): AppointmentAgendaItem[] {
    return this.appointmentsByDate().get(date) ?? [];
  }

  protected apptTopPx(appt: AppointmentAgendaItem): number {
    const { hour, minute } = laPazHourMinute(appt.appointmentDatetime);
    const minutesFromStart = hour * 60 + minute - this.GRID_START_HOUR * 60;
    return (minutesFromStart / this.SLOT_MINUTES) * this.ROW_HEIGHT_PX;
  }

  protected setScope(scope: AgendaScope): void {
    this.scope.set(scope);
  }

  protected slotColor(a: AppointmentAgendaItem): string {
    return a.doctorColor ?? FALLBACK_DOCTOR_COLOR;
  }

  /** Posición horizontal del turno dentro de la columna del día, según su carril. */
  protected slotLeft(a: AppointmentAgendaItem): string {
    const { lane, lanes } = this.lanesById().get(a.id) ?? { lane: 0, lanes: 1 };
    return `calc(4px + (100% - 8px) * ${lane} / ${lanes})`;
  }

  protected slotWidth(a: AppointmentAgendaItem): string {
    const { lanes } = this.lanesById().get(a.id) ?? { lanes: 1 };
    return `calc((100% - 8px) / ${lanes} - ${lanes > 1 ? 2 : 0}px)`;
  }

  /** Solo se abre el detalle de un turno propio — en la agenda común, los ajenos son de consulta. */
  protected canOpen(a: AppointmentAgendaItem): boolean {
    if (this.readOnly() || this.picking()) {
      return false;
    }
    return this.effectiveScope() !== 'all' || a.doctorId === this.authService.currentUser()?.id;
  }

  protected slotTitle(a: AppointmentAgendaItem): string {
    const parts = [
      this.formatDatetime(a.appointmentDatetime),
      this.patientLabel(a),
      this.patientPhone(a),
    ];
    if (a.treatmentName) {
      parts.push(a.treatmentName);
    }
    if (a.source === 'doctor') {
      parts.push('Agendada por el doctor');
    }
    if (this.effectiveScope() === 'all') {
      parts.unshift(a.doctorName ?? 'Doctor');
    }
    return parts.join(' · ');
  }

  protected patientLabel(a: AppointmentAgendaItem): string {
    return appointmentPatientLabel(a);
  }

  protected patientPhone(a: AppointmentAgendaItem): string {
    return a.patientPhone ?? a.guestPhone ?? '—';
  }

  protected formatDatetime(iso: string): string {
    return TIME_FORMATTER.format(new Date(iso));
  }

  protected onPrevPage(): void {
    this.selectedDate.set(addDaysToDateString(this.selectedDate(), -7));
    void this.load();
  }

  protected onNextPage(): void {
    this.selectedDate.set(addDaysToDateString(this.selectedDate(), 7));
    void this.load();
  }

  protected onToday(): void {
    this.selectedDate.set(mondayOf(laPazDateString(new Date())));
    void this.load();
  }

  protected onOpenDetail(a: AppointmentAgendaItem): void {
    if (!this.canOpen(a)) {
      return;
    }
    this.detailAppointment.set(a);
  }

  protected onHistoryDone(): void {
    this.historyPatientId.set(null);
    this.historyOrigin.set(null);
    void this.load();
  }

  /**
   * CLI-152: terminó de cargar la ficha desde un turno de hoy o anterior —
   * con el paciente todavía en el consultorio, se ofrece agendar el control.
   */
  protected onHistoryComplete(): void {
    const origin = this.historyOrigin();
    this.onHistoryDone();
    const today = laPazDateString(new Date());
    if (!origin?.patientId || laPazDateString(new Date(origin.appointmentDatetime)) > today) {
      return;
    }
    this.followUpOffer.set({ origin, upcoming: null });
    void this.loadUpcomingFor(origin, today);
  }

  /** La próxima cita que el paciente ya tiene con este doctor, para avisarla en la oferta (no bloquea). */
  private async loadUpcomingFor(origin: AppointmentAgendaItem, today: string): Promise<void> {
    try {
      const upcoming = await firstValueFrom(
        this.appointmentsService.getAgenda({
          status: 'confirmed',
          from: today,
          to: addDaysToDateString(today, 365),
        }),
      );
      const now = Date.now();
      const next =
        upcoming.find(
          (a) =>
            a.patientId === origin.patientId &&
            a.id !== origin.id &&
            new Date(a.appointmentDatetime).getTime() > now,
        ) ?? null;
      if (next && this.followUpOffer()?.origin.id === origin.id) {
        this.followUpOffer.set({ origin, upcoming: next });
      }
    } catch {
      // Sin el dato, la oferta sigue igual — es solo un aviso.
    }
  }

  protected upcomingLabel(a: AppointmentAgendaItem): string {
    return `${this.dayLabelOf(a.appointmentDatetime)} a las ${this.formatDatetime(a.appointmentDatetime)}`;
  }

  /** "Agendar": la semana siguiente a la del turno, esperando el click en el horario. */
  protected onAcceptFollowUp(): void {
    const offer = this.followUpOffer();
    if (!offer) {
      return;
    }
    this.followUpOffer.set(null);
    this.scope.set('mine');
    this.followUpPick.set(offer.origin);
    this.selectedDate.set(
      addDaysToDateString(mondayOf(laPazDateString(new Date(offer.origin.appointmentDatetime))), 7),
    );
    void this.load();
  }

  protected onDismissFollowUp(): void {
    this.followUpOffer.set(null);
  }
}
