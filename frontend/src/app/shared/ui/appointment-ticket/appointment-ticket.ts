import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { CLINIC_TIME_ZONE, relativeDayLabel } from '../../utils/clinic-date.util';

const fmt = (options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat('es-BO', { timeZone: CLINIC_TIME_ZONE, ...options });
const DAY = fmt({ day: 'numeric' });
const MONTH = fmt({ month: 'short' });
const WEEKDAY = fmt({ weekday: 'long' });
const TIME = fmt({ hour: '2-digit', minute: '2-digit', hour12: false });

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * La tarjeta de cita (CLI-267): el cartoncito que la clínica le da al
 * paciente con su próxima cita — el talón con el día en grande y, al lado,
 * cuándo falta, la hora, el tratamiento y el doctor. Solo presentación.
 */
@Component({
  selector: 'app-appointment-ticket',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './appointment-ticket.html',
  styleUrl: './appointment-ticket.scss',
  host: {
    '[class.ticket--hero]': "size() === 'hero'",
    '[class.ticket--soon]': 'soon()',
  },
})
export class AppointmentTicketComponent {
  /** Fecha y hora de la cita (ISO). */
  readonly datetime = input.required<string>();
  readonly durationMinutes = input<number | null>(null);
  readonly title = input.required<string>();
  readonly doctorName = input<string | null>(null);
  /** `hero` en el inicio del paciente; `compact` en las listas. */
  readonly size = input<'hero' | 'compact'>('compact');
  /** Referencia para "Hoy"/"Mañana" — en los tests se fija; en la app es ahora. */
  readonly now = input<Date | null>(null);

  private readonly date = computed(() => new Date(this.datetime()));

  protected readonly day = computed(() => DAY.format(this.date()));
  protected readonly month = computed(() => MONTH.format(this.date()).replace('.', ''));
  protected readonly weekday = computed(() => capitalize(WEEKDAY.format(this.date())));
  protected readonly relative = computed(() => relativeDayLabel(this.datetime(), this.now() ?? new Date()));
  protected readonly soon = computed(() => this.relative() === 'Hoy' || this.relative() === 'Mañana');

  protected readonly timeRange = computed(() => {
    const start = TIME.format(this.date());
    const minutes = this.durationMinutes();
    if (!minutes) {
      return start;
    }
    const end = TIME.format(new Date(this.date().getTime() + minutes * 60_000));
    return `${start} – ${end}`;
  });

  protected readonly label = computed(
    () => `Cita ${this.relative().toLowerCase()}, ${this.weekday()} ${this.day()} de ${this.month()} a las ${TIME.format(this.date())}: ${this.title()}`,
  );
}
