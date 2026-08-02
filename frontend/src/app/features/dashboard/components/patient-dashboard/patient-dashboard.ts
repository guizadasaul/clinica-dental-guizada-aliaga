import {
  Component,
  ChangeDetectionStrategy,
  inject,
  input,
  output,
  computed,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { AuthService } from '../../../../auth/application/auth.service';
import { PatientsService } from '../../../patients/services/patients.service';
import { TreatmentHistoryComponent } from '../../../treatments/components/treatment-history/treatment-history';

@Component({
  selector: 'app-patient-dashboard',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TreatmentHistoryComponent],
  templateUrl: './patient-dashboard.html',
  styleUrl: './patient-dashboard.scss',
})
export class PatientDashboardComponent {
  private readonly authService = inject(AuthService);
  private readonly patientsService = inject(PatientsService);

  readonly activeNav = input<string>('home');
  readonly navChange = output<string>();

  protected readonly user = this.authService.currentUser;

  protected readonly myPatient = toSignal(
    this.patientsService.getMyPatientStatus().pipe(map((status) => status.patient)),
    { initialValue: null },
  );

  protected readonly patientId = computed(() => this.myPatient()?.id ?? null);

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
