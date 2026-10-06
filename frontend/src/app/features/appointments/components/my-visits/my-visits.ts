import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { catchError, of } from 'rxjs';
import { AppointmentsService } from '../../services/appointments.service';
import type { PatientAppointment } from '../../models/appointment.model';
import { CLINIC_TIME_ZONE } from '../../../../shared/utils/clinic-date.util';

const fmt = (options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat('es-BO', { timeZone: CLINIC_TIME_ZONE, ...options });
const WEEKDAY = fmt({ weekday: 'long' });
const DAY = fmt({ day: '2-digit' });
const MONTH_SHORT = fmt({ month: 'short' });
const MONTH_YEAR = fmt({ month: 'long', year: 'numeric' });
const LONG_DATE = fmt({ weekday: 'long', day: 'numeric', month: 'long' });
const TIME = fmt({ hour: '2-digit', minute: '2-digit' });
// en-CA formatea como YYYY-MM-DD: sirve de clave de día en hora de Bolivia.
const DAY_KEY = new Intl.DateTimeFormat('en-CA', {
  timeZone: CLINIC_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const DAY_MS = 86_400_000;

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

interface VisitView {
  id: string;
  weekday: string;
  day: string;
  month: string;
  when: string;
  time: string;
  duration: number;
  title: string;
  doctorName: string | null;
  noShow: boolean;
}

interface MonthGroup {
  label: string;
  visits: VisitView[];
}

function toView(a: PatientAppointment): VisitView {
  const date = new Date(a.appointmentDatetime);
  return {
    id: a.id,
    weekday: capitalize(WEEKDAY.format(date)),
    day: DAY.format(date),
    month: MONTH_SHORT.format(date).replace('.', '').toUpperCase(),
    when: capitalize(LONG_DATE.format(date)),
    time: TIME.format(date),
    duration: a.durationMinutes,
    title: a.treatmentName ?? 'Consulta odontológica',
    doctorName: a.doctorName,
    noShow: a.status === 'no_show',
  };
}

/** Días de calendario (Bolivia) entre hoy y la cita: 0 = hoy, 1 = mañana. */
function daysUntil(iso: string, now: Date): number {
  const toUtcMidnight = (d: Date) => Date.parse(`${DAY_KEY.format(d)}T00:00:00Z`);
  return Math.round((toUtcMidnight(new Date(iso)) - toUtcMidnight(now)) / DAY_MS);
}

/**
 * "Mis citas" del paciente (CLI-210): sus próximas citas y el registro de
 * todas las veces que vino a la clínica, agrupado por mes. Las que el doctor
 * marcó "No asistió" (CLI-208) se muestran aparte y no cuentan como visita.
 */
@Component({
  selector: 'app-my-visits',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './my-visits.html',
  styleUrl: './my-visits.scss',
})
export class MyVisitsComponent {
  private readonly appointmentsService = inject(AppointmentsService);

  /** null mientras carga; si falla, como si no hubiera. */
  private readonly upcomingRaw = toSignal(
    this.appointmentsService.getMyUpcoming().pipe(catchError(() => of([]))),
    { initialValue: null },
  );
  private readonly pastRaw = toSignal(
    this.appointmentsService.getMyPast().pipe(catchError(() => of([]))),
    { initialValue: null },
  );

  protected readonly loading = computed(() => this.upcomingRaw() === null || this.pastRaw() === null);
  protected readonly upcoming = computed(() => (this.upcomingRaw() ?? []).map(toView));

  protected readonly months = computed<MonthGroup[]>(() => {
    const groups: MonthGroup[] = [];
    for (const appointment of this.pastRaw() ?? []) {
      const label = capitalize(MONTH_YEAR.format(new Date(appointment.appointmentDatetime)));
      const last = groups.at(-1);
      if (last?.label === label) {
        last.visits.push(toView(appointment));
      } else {
        groups.push({ label, visits: [toView(appointment)] });
      }
    }
    return groups;
  });

  private readonly attended = computed(() => (this.pastRaw() ?? []).filter((a) => a.status !== 'no_show'));
  protected readonly visitsCount = computed(() => this.attended().length);
  protected readonly firstVisit = computed(() => {
    const first = this.attended().at(-1);
    return first ? MONTH_YEAR.format(new Date(first.appointmentDatetime)) : null;
  });

  protected readonly nextIn = computed(() => {
    const next = this.upcomingRaw()?.[0];
    if (!next) {
      return null;
    }
    const days = daysUntil(next.appointmentDatetime, new Date());
    if (days <= 0) {
      return 'Hoy';
    }
    return days === 1 ? 'Mañana' : `En ${days} días`;
  });
}
