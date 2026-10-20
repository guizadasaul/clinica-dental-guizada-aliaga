import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { catchError, of } from 'rxjs';
import { AppointmentsService } from '../../services/appointments.service';
import type { PatientAppointment } from '../../models/appointment.model';
import { CLINIC_TIME_ZONE } from '../../../../shared/utils/clinic-date.util';
import { PageHeaderComponent } from '../../../../shared/ui/page-header/page-header';
import { AppointmentTicketComponent } from '../../../../shared/ui/appointment-ticket/appointment-ticket';

const fmt = (options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat('es-BO', { timeZone: CLINIC_TIME_ZONE, ...options });
const MONTH_YEAR = fmt({ month: 'long', year: 'numeric' });
const LONG_DATE = fmt({ weekday: 'long', day: 'numeric', month: 'long' });
const TIME = fmt({ hour: '2-digit', minute: '2-digit', hour12: false });
const DAY = fmt({ day: 'numeric' });
const WEEKDAY_SHORT = fmt({ weekday: 'short' });

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

interface VisitView {
  id: string;
  /** CLI-267: la hoja de calendario de la fila — el día y el día de la semana abreviado. */
  day: string;
  weekday: string;
  when: string;
  time: string;
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
    day: DAY.format(date),
    weekday: capitalize(WEEKDAY_SHORT.format(date).replace('.', '')),
    when: capitalize(LONG_DATE.format(date)),
    time: TIME.format(date),
    title: a.treatmentName ?? 'Consulta odontológica',
    doctorName: a.doctorName,
    noShow: a.status === 'no_show',
  };
}

/**
 * "Mis citas" del paciente (CLI-210, rediseño CLI-267): sus próximas citas
 * como tarjetas de cita y el registro de todas las veces que vino a la
 * clínica, agrupado por mes, cada visita con su hoja de calendario. Solo las
 * que el doctor marcó "No asistió" (CLI-208) llevan una marca.
 */
@Component({
  selector: 'app-my-visits',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PageHeaderComponent, AppointmentTicketComponent],
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
  /** Las próximas van como tarjetas de cita (CLI-267), con los datos tal cual llegan. */
  protected readonly upcoming = computed(() => this.upcomingRaw() ?? []);

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
}
