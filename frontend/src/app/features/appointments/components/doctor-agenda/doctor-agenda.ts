import { Component, ChangeDetectionStrategy, inject, signal, computed } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AppointmentsService } from '../../services/appointments.service';
import { PatientWizardComponent } from '../../../patients/components/patient-wizard/patient-wizard';
import type { AppointmentAgendaItem } from '../../models/appointment.model';

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

@Component({
  selector: 'app-doctor-agenda',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PatientWizardComponent],
  templateUrl: './doctor-agenda.html',
  styleUrl: './doctor-agenda.scss',
})
export class DoctorAgendaComponent {
  private readonly appointmentsService = inject(AppointmentsService);

  // Grilla horaria: 09:00–21:00 en franjas de 30 min (igual duración que
  // reserva cada cita, ver SLOT_MINUTES en api/src/appointments/domain/ClinicSchedule.ts).
  protected readonly GRID_START_HOUR = 9;
  protected readonly GRID_END_HOUR = 24;
  protected readonly SLOT_MINUTES = 30;
  protected readonly ROW_HEIGHT_PX = 40;
  protected readonly totalSlots =
    ((this.GRID_END_HOUR - this.GRID_START_HOUR) * 60) / this.SLOT_MINUTES;
  protected readonly gridHeightPx = this.totalSlots * this.ROW_HEIGHT_PX;

  protected readonly hourMarks: HourMark[] = Array.from(
    { length: this.GRID_END_HOUR - this.GRID_START_HOUR + 1 },
    (_, i) => ({
      label: `${this.GRID_START_HOUR + i}:00`,
      offset: i * (60 / this.SLOT_MINUTES) * this.ROW_HEIGHT_PX,
    }),
  );

  protected readonly gridLines: GridLine[] = Array.from(
    { length: this.totalSlots },
    (_, i) => ({ offset: i * this.ROW_HEIGHT_PX, isHour: i % 2 === 0 }),
  );

  // Sábado y domingo comparten una sexta columna (mismo ancho que el resto),
  // dividida horizontalmente por la mitad — cada mitad es un panel con la
  // misma escala 9:00–24:00 que el resto de la semana (para poder registrar
  // una emergencia a cualquier hora), con scroll vertical propio e
  // independiente entre sí. El viewport de cada panel ocupa todo el alto
  // disponible de la columna (sin dejar espacio vacío abajo) — igual debe
  // scrollearse para ver más allá de las primeras horas visibles.
  protected readonly DIVIDER_HEIGHT_PX = 54;
  protected readonly panelViewportPx = (this.gridHeightPx - this.DIVIDER_HEIGHT_PX) / 2;

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

  // Semana completa (lunes a domingo), siempre — nunca arranca en el día
  // actual. Sábado y domingo comparten una sexta columna del mismo ancho
  // que el resto, partida horizontalmente en dos mini-grillas.
  protected readonly VIEW_DAYS = 7;
  protected readonly selectedDate = signal(mondayOf(laPazDateString(new Date())));

  protected readonly gridTemplateColumns = '56px repeat(6, minmax(140px, 1fr))';

  protected readonly visibleDates = computed(() =>
    Array.from({ length: this.VIEW_DAYS }, (_, i) =>
      addDaysToDateString(this.selectedDate(), i),
    ),
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
    const last = this.dayHeaderParts(dates[dates.length - 1]);
    const month = capitalize(
      MONTH_FORMATTER.format(new Date(`${dates[dates.length - 1]}T12:00:00-04:00`)),
    );
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

  constructor() {
    void this.load();
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
      const result = await firstValueFrom(
        this.appointmentsService.getAgenda({ status: 'confirmed', from, to }),
      );
      this.appointments.set(result);
    } catch {
      this.error.set('No pudimos cargar la agenda.');
    } finally {
      this.loading.set(false);
    }
  }

  protected appointmentsFor(date: string): AppointmentAgendaItem[] {
    return this.appointmentsByDate().get(date) ?? [];
  }

  protected apptTopPx(appt: AppointmentAgendaItem): number {
    const { hour, minute } = laPazHourMinute(appt.appointmentDatetime);
    const minutesFromStart = hour * 60 + minute - this.GRID_START_HOUR * 60;
    return (minutesFromStart / this.SLOT_MINUTES) * this.ROW_HEIGHT_PX;
  }

  protected patientLabel(a: AppointmentAgendaItem): string {
    if (a.patientFirstName) {
      return `${a.patientFirstName} ${a.patientLastNamePaternal ?? ''}`.trim();
    }
    return a.guestFullName ?? 'Paciente sin datos';
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

  protected onOpenHistory(a: AppointmentAgendaItem): void {
    if (!a.patientId) {
      return;
    }
    this.historyPatientId.set(a.patientId);
  }

  protected onHistoryDone(): void {
    this.historyPatientId.set(null);
    void this.load();
  }
}
