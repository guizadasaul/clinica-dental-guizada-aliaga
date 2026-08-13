import {
  Component,
  ChangeDetectionStrategy,
  inject,
  input,
  signal,
  computed,
} from '@angular/core';
import { AuthService } from '../../../../auth/application/auth.service';
import { PatientsListComponent } from '../../../patients/components/patients-list/patients-list';
import { PatientWizardComponent } from '../../../patients/components/patient-wizard/patient-wizard';
import { RegisterTreatmentComponent } from '../../../treatments/components/register-treatment/register-treatment';
import { TreatmentHistoryComponent } from '../../../treatments/components/treatment-history/treatment-history';
import { DoctorAgendaComponent } from '../../../appointments/components/doctor-agenda/doctor-agenda';

interface AppointmentSlot {
  readonly time: string;
  readonly patientName: string;
  readonly treatment: string;
  readonly status: 'confirmed' | 'pending' | 'done';
}

interface StatCard {
  readonly icon: string;
  readonly value: string | number;
  readonly label: string;
  readonly color: string;
}

@Component({
  selector: 'app-doctor-dashboard',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    PatientsListComponent,
    PatientWizardComponent,
    RegisterTreatmentComponent,
    TreatmentHistoryComponent,
    DoctorAgendaComponent,
  ],
  templateUrl: './doctor-dashboard.html',
  styleUrl: './doctor-dashboard.scss',
})
export class DoctorDashboardComponent {
  private readonly authService = inject(AuthService);

  readonly activeNav = input<string>('home');

  protected readonly user = this.authService.currentUser;

  protected readonly selectedUserId = signal<string | null>(null);
  protected readonly selectedPatientId = signal<string | null>(null);
  protected readonly selectedPatientForTreatment = signal<string | null>(null);
  protected readonly selectedPatientForHistory = signal<string | null>(null);

  protected readonly showWizard = computed(
    () =>
      (this.selectedUserId() !== null || this.selectedPatientId() !== null) &&
      this.selectedPatientForTreatment() === null &&
      this.selectedPatientForHistory() === null,
  );

  protected readonly showTreatmentFlow = computed(
    () => this.selectedPatientForTreatment() !== null,
  );

  protected readonly showHistoryFlow = computed(
    () => this.selectedPatientForHistory() !== null,
  );

  protected readonly firstName = computed(() => {
    const name = this.user()?.displayName;
    return name ? name.split(' ')[0] : 'Doctor';
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

  protected readonly stats: StatCard[] = [
    { icon: 'group', value: 0, label: 'Pacientes hoy', color: 'navy' },
    { icon: 'event_available', value: 0, label: 'Citas confirmadas', color: 'success' },
    { icon: 'pending_actions', value: 0, label: 'Pendientes', color: 'warning' },
  ];

  protected readonly appointments: AppointmentSlot[] = [];

  protected readonly statusLabel: Record<AppointmentSlot['status'], string> = {
    confirmed: 'Confirmada',
    pending: 'Pendiente',
    done: 'Completada',
  };

  protected onStartWizard(userId: string): void {
    this.selectedUserId.set(userId);
    this.selectedPatientId.set(null);
  }

  protected onOpenOdontogram(patientId: string): void {
    this.selectedPatientId.set(patientId);
    this.selectedUserId.set(null);
  }

  protected onWizardComplete(): void {
    this.selectedUserId.set(null);
    this.selectedPatientId.set(null);
  }

  protected onWizardCancel(): void {
    this.selectedUserId.set(null);
    this.selectedPatientId.set(null);
  }

  protected onRegisterTreatment(patientId: string): void {
    this.selectedPatientForTreatment.set(patientId);
    this.selectedUserId.set(null);
    this.selectedPatientId.set(null);
    this.selectedPatientForHistory.set(null);
  }

  protected onTreatmentDone(): void {
    this.selectedPatientForTreatment.set(null);
  }

  protected onTreatmentCancel(): void {
    this.selectedPatientForTreatment.set(null);
  }

  protected onViewHistory(patientId: string): void {
    this.selectedPatientForHistory.set(patientId);
    this.selectedUserId.set(null);
    this.selectedPatientId.set(null);
    this.selectedPatientForTreatment.set(null);
  }

  protected onHistoryClose(): void {
    this.selectedPatientForHistory.set(null);
  }
}
