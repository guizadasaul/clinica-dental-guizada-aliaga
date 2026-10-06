import {
  Component,
  ChangeDetectionStrategy,
  inject,
  input,
  output,
  computed,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { catchError, map, of } from 'rxjs';
import { AuthService } from '../../../../auth/application/auth.service';
import { PatientsService } from '../../../patients/services/patients.service';
import { AppointmentsService } from '../../../appointments/services/appointments.service';
import type { PatientAppointment } from '../../../appointments/models/appointment.model';
import { MyTreatmentHistoryComponent } from '../../../treatments/components/my-treatment-history/my-treatment-history';
import { MyQuoteComponent } from '../../../quotes/components/my-quote/my-quote';
import { MyVisitsComponent } from '../../../appointments/components/my-visits/my-visits';
import { QuotesService } from '../../../quotes/services/quotes.service';
import { formatBs } from '../../../../shared/utils/money.util';

/** WhatsApp de la clínica (mismo número que la landing y la reserva). */
const CLINIC_WHATSAPP = '59157744250';

// Las citas se muestran siempre en hora de Bolivia, esté donde esté el paciente.
const LONG_DATE_FORMATTER = new Intl.DateTimeFormat('es-BO', {
  timeZone: 'America/La_Paz',
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});
const MONTH_YEAR_FORMATTER = new Intl.DateTimeFormat('es-BO', {
  timeZone: 'America/La_Paz',
  month: 'long',
  year: 'numeric',
});
const TIME_FORMATTER = new Intl.DateTimeFormat('es-BO', {
  timeZone: 'America/La_Paz',
  hour: '2-digit',
  minute: '2-digit',
});

@Component({
  selector: 'app-patient-dashboard',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MyTreatmentHistoryComponent, MyQuoteComponent, MyVisitsComponent],
  templateUrl: './patient-dashboard.html',
  styleUrl: './patient-dashboard.scss',
})
export class PatientDashboardComponent {
  private readonly authService = inject(AuthService);
  private readonly patientsService = inject(PatientsService);
  private readonly appointmentsService = inject(AppointmentsService);
  private readonly quotesService = inject(QuotesService);

  readonly activeNav = input<string>('home');
  readonly navChange = output<string>();

  protected readonly user = this.authService.currentUser;

  protected readonly myPatient = toSignal(
    this.patientsService.getMyPatientStatus().pipe(map((status) => status.patient)),
    { initialValue: null },
  );

  protected readonly patientId = computed(() => this.myPatient()?.id ?? null);

  /** CLI-153: próximas citas confirmadas (null mientras carga; si falla, como si no hubiera). */
  protected readonly upcoming = toSignal(
    this.appointmentsService.getMyUpcoming().pipe(catchError(() => of([]))),
    { initialValue: null },
  );
  protected readonly nextAppointment = computed(() => this.upcoming()?.[0] ?? null);
  protected readonly laterAppointments = computed(() => this.upcoming()?.slice(1) ?? []);

  /** CLI-209: registro de visitas (null mientras carga; si falla, como si no hubiera). */
  private readonly visits = toSignal(
    this.appointmentsService.getMyPast().pipe(catchError(() => of([]))),
    { initialValue: null },
  );
  /** Visitas reales: las "No asistió" no cuentan. */
  private readonly attended = computed(
    () => this.visits()?.filter((v) => v.status !== 'no_show') ?? null,
  );
  protected readonly visitsCount = computed(() => this.attended()?.length ?? null);
  protected readonly firstVisitLabel = computed(() => {
    const list = this.attended();
    const first = list?.at(-1);
    return first ? MONTH_YEAR_FORMATTER.format(new Date(first.appointmentDatetime)) : null;
  });

  /** CLI-209: lo que debe sumando sus presupuestos compartidos. */
  private readonly quotes = toSignal(
    this.quotesService.getMine().pipe(catchError(() => of([]))),
    { initialValue: null },
  );
  protected readonly account = computed(() => {
    const quotes = this.quotes();
    if (!quotes) {
      return null;
    }
    const total = quotes.reduce((sum, q) => sum + q.totalAmount, 0);
    const paid = quotes.reduce((sum, q) => sum + q.totalPaid, 0);
    const balance = quotes.reduce((sum, q) => sum + q.balance, 0);
    return {
      hasQuotes: quotes.length > 0,
      balance: formatBs(balance),
      paidPercent: total > 0 ? Math.min(100, Math.round((paid / total) * 100)) : 0,
      settled: quotes.length > 0 && balance <= 0,
    };
  });

  protected readonly whatsappUrl = computed(() => {
    const name = this.user()?.displayName;
    const text = name
      ? `Hola, soy ${name}. Quisiera hacer una consulta sobre mi atención en la clínica.`
      : 'Hola, quisiera hacer una consulta sobre mi atención en la clínica.';
    return `https://wa.me/${CLINIC_WHATSAPP}?text=${encodeURIComponent(text)}`;
  });

  protected longDate(a: PatientAppointment): string {
    const text = LONG_DATE_FORMATTER.format(new Date(a.appointmentDatetime));
    return text.charAt(0).toUpperCase() + text.slice(1);
  }

  protected time(a: PatientAppointment): string {
    return TIME_FORMATTER.format(new Date(a.appointmentDatetime));
  }

  protected readonly firstName = computed(() => {
    const name = this.user()?.displayName;
    return name ? name.split(' ')[0] : 'Paciente';
  });

  protected readonly greeting = computed(() => {
    const hour = new Date().getHours();
    if (hour < 12) { return 'Buenos días'; }
    if (hour < 19) { return 'Buenas tardes'; }
    return 'Buenas noches';
  });

  protected readonly today = computed(() =>
    new Date().toLocaleDateString('es-BO', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }),
  );
}
