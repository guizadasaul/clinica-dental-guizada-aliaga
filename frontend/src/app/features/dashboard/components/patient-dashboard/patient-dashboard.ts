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
import { TreatmentHistoryComponent } from '../../../treatments/components/treatment-history/treatment-history';
import { LogoComponent } from '../../../../shared/ui/logo/logo';
import { MyQuoteComponent } from '../../../quotes/components/my-quote/my-quote';

// Las citas se muestran siempre en hora de Bolivia, esté donde esté el paciente.
const SHORT_DATE_FORMATTER = new Intl.DateTimeFormat('es-BO', {
  timeZone: 'America/La_Paz',
  weekday: 'short',
  day: 'numeric',
  month: 'numeric',
});
const LONG_DATE_FORMATTER = new Intl.DateTimeFormat('es-BO', {
  timeZone: 'America/La_Paz',
  weekday: 'long',
  day: 'numeric',
  month: 'long',
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
  imports: [TreatmentHistoryComponent, LogoComponent, MyQuoteComponent],
  templateUrl: './patient-dashboard.html',
  styleUrl: './patient-dashboard.scss',
})
export class PatientDashboardComponent {
  private readonly authService = inject(AuthService);
  private readonly patientsService = inject(PatientsService);
  private readonly appointmentsService = inject(AppointmentsService);

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

  protected readonly nextShortLabel = computed(() => {
    const next = this.nextAppointment();
    return next ? SHORT_DATE_FORMATTER.format(new Date(next.appointmentDatetime)) : '—';
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
    new Date().toLocaleDateString('es-AR', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }),
  );

  protected onHistoryClose(): void {
    this.navChange.emit('home');
  }
}
