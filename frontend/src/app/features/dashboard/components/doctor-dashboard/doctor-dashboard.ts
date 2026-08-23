import {
  Component,
  ChangeDetectionStrategy,
  inject,
  input,
  output,
  signal,
  computed,
} from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../../../auth/application/auth.service';
import { PatientsListComponent } from '../../../patients/components/patients-list/patients-list';
import { PatientWizardComponent } from '../../../patients/components/patient-wizard/patient-wizard';
import { PatientInvitePanelComponent } from '../../../patients/components/patient-invite-panel/patient-invite-panel';
import { RegisterTreatmentComponent } from '../../../treatments/components/register-treatment/register-treatment';
import { TreatmentHistoryComponent } from '../../../treatments/components/treatment-history/treatment-history';
import { ClinicalRecordViewComponent } from '../../../patients/components/clinical-record-view/clinical-record-view';
import { QuoteBuilderComponent } from '../../../quotes/components/quote-builder/quote-builder';
import { DoctorAgendaComponent } from '../../../appointments/components/doctor-agenda/doctor-agenda';
import { AppointmentsService } from '../../../appointments/services/appointments.service';
import type { AppointmentAgendaItem } from '../../../appointments/models/appointment.model';
import { TestimonialReviewComponent } from '../../../testimonials/components/testimonial-review/testimonial-review';
import type { Patient, PatientInviteContact } from '../../../patients/models/patient.model';
import type { InviteChannel } from '../../../patient-invites/services/patient-invites.service';

const INVITE_SUCCESS_MESSAGE: Record<InviteChannel, string> = {
  email: 'Correo enviado correctamente. El paciente recibirá el link de registro en su casilla.',
  whatsapp: 'Mensaje de WhatsApp listo para enviar.',
};

const TIME_FORMATTER = new Intl.DateTimeFormat('es-BO', {
  timeZone: 'America/La_Paz',
  hour: '2-digit',
  minute: '2-digit',
});

function laPazDateString(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/La_Paz' }).format(date);
}

// Bolivia es UTC-4 fijo, sin horario de verano — sumar días de calendario en
// UTC es seguro (mismo truco que usa el backend, api/src/appointments).
function addDaysToDateString(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number);
  const next = new Date(Date.UTC(year, month - 1, day));
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}

interface AppointmentSlot {
  readonly time: string;
  readonly patientName: string;
  readonly phone: string;
}

@Component({
  selector: 'app-doctor-dashboard',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    PatientsListComponent,
    PatientWizardComponent,
    PatientInvitePanelComponent,
    RegisterTreatmentComponent,
    TreatmentHistoryComponent,
    ClinicalRecordViewComponent,
    QuoteBuilderComponent,
    DoctorAgendaComponent,
    TestimonialReviewComponent,
  ],
  templateUrl: './doctor-dashboard.html',
  styleUrl: './doctor-dashboard.scss',
})
export class DoctorDashboardComponent {
  private readonly authService = inject(AuthService);
  private readonly appointmentsService = inject(AppointmentsService);

  readonly activeNav = input<string>('home');
  readonly navChange = output<string>();

  protected readonly user = this.authService.currentUser;

  protected readonly selectedUserId = signal<string | null>(null);
  protected readonly selectedPatientId = signal<string | null>(null);
  /** Solo se usa para precargar el paso 1 ("Registrar diagnóstico") — null en cualquier otro flujo del wizard. */
  protected readonly selectedPatientForDiagnosis = signal<Patient | null>(null);
  /** Paso donde arranca el wizard al editar — 4 (examen dental) por defecto. */
  protected readonly wizardStartStep = signal(4);
  protected readonly selectedPatientForTreatment = signal<string | null>(null);
  protected readonly selectedPatientForHistory = signal<string | null>(null);
  protected readonly selectedPatientForQuote = signal<string | null>(null);
  protected readonly selectedPatientForInvite = signal<PatientInviteContact | null>(null);
  /** "Ver historia clínica" — resumen de solo lectura, no reusa el wizard editable (CLI-40). */
  protected readonly selectedPatientForClinicalRecord = signal<Patient | null>(null);
  protected readonly inviteSuccessMessage = signal<string | null>(null);
  private inviteSuccessTimeout: ReturnType<typeof setTimeout> | null = null;

  protected readonly showWizard = computed(
    () =>
      (this.selectedUserId() !== null || this.selectedPatientId() !== null) &&
      this.selectedPatientForTreatment() === null &&
      this.selectedPatientForHistory() === null &&
      this.selectedPatientForQuote() === null &&
      this.selectedPatientForInvite() === null &&
      this.selectedPatientForClinicalRecord() === null,
  );

  protected readonly showInviteFlow = computed(
    () => this.selectedPatientForInvite() !== null,
  );

  protected readonly showTreatmentFlow = computed(
    () => this.selectedPatientForTreatment() !== null,
  );

  protected readonly showHistoryFlow = computed(
    () => this.selectedPatientForHistory() !== null,
  );

  protected readonly showQuoteFlow = computed(
    () => this.selectedPatientForQuote() !== null,
  );

  protected readonly showClinicalRecordFlow = computed(
    () => this.selectedPatientForClinicalRecord() !== null,
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

  protected readonly appointments = signal<AppointmentSlot[]>([]);

  constructor() {
    void this.loadTodayAgenda();
  }

  private async loadTodayAgenda(): Promise<void> {
    const from = laPazDateString(new Date());
    const to = addDaysToDateString(from, 1);
    try {
      const result = await firstValueFrom(
        this.appointmentsService.getAgenda({ status: 'confirmed', from, to }),
      );
      this.appointments.set(result.map((a) => this.toAppointmentSlot(a)));
    } catch {
      this.appointments.set([]);
    }
  }

  private toAppointmentSlot(a: AppointmentAgendaItem): AppointmentSlot {
    const patientName = a.patientFirstName
      ? `${a.patientFirstName} ${a.patientLastNamePaternal ?? ''}`.trim()
      : (a.guestFullName ?? 'Paciente sin datos');
    return {
      time: TIME_FORMATTER.format(new Date(a.appointmentDatetime)),
      patientName,
      phone: a.patientPhone ?? a.guestPhone ?? '—',
    };
  }

  protected onGoToPatients(): void {
    this.navChange.emit('patients');
  }

  protected onStartWizard(userId: string): void {
    this.selectedUserId.set(userId);
    this.selectedPatientId.set(null);
    this.selectedPatientForInvite.set(null);
    this.selectedPatientForDiagnosis.set(null);
    this.selectedPatientForClinicalRecord.set(null);
  }

  protected onOpenOdontogram(patientId: string): void {
    this.selectedPatientId.set(patientId);
    this.selectedUserId.set(null);
    this.selectedPatientForInvite.set(null);
    this.selectedPatientForDiagnosis.set(null);
    this.selectedPatientForClinicalRecord.set(null);
    this.wizardStartStep.set(4);
  }

  protected onRegisterDiagnosis(patient: Patient): void {
    this.selectedPatientId.set(patient.id);
    this.selectedUserId.set(null);
    this.selectedPatientForInvite.set(null);
    this.selectedPatientForDiagnosis.set(patient);
    this.selectedPatientForClinicalRecord.set(null);
    this.wizardStartStep.set(1);
  }

  /** Resumen de solo lectura — no abre el wizard editable (CLI-40). */
  protected onViewClinicalRecord(patient: Patient): void {
    this.selectedPatientForClinicalRecord.set(patient);
    this.selectedUserId.set(null);
    this.selectedPatientId.set(null);
    this.selectedPatientForDiagnosis.set(null);
    this.selectedPatientForInvite.set(null);
    this.selectedPatientForTreatment.set(null);
    this.selectedPatientForHistory.set(null);
    this.selectedPatientForQuote.set(null);
  }

  protected onClinicalRecordClose(): void {
    this.selectedPatientForClinicalRecord.set(null);
  }

  protected onWizardComplete(): void {
    this.selectedUserId.set(null);
    this.selectedPatientId.set(null);
    this.selectedPatientForDiagnosis.set(null);
  }

  protected onWizardCancel(): void {
    this.selectedUserId.set(null);
    this.selectedPatientId.set(null);
    this.selectedPatientForDiagnosis.set(null);
  }

  protected onRegisterTreatment(patientId: string): void {
    this.selectedPatientForTreatment.set(patientId);
    this.selectedUserId.set(null);
    this.selectedPatientId.set(null);
    this.selectedPatientForDiagnosis.set(null);
    this.selectedPatientForHistory.set(null);
    this.selectedPatientForQuote.set(null);
    this.selectedPatientForInvite.set(null);
    this.selectedPatientForClinicalRecord.set(null);
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
    this.selectedPatientForDiagnosis.set(null);
    this.selectedPatientForTreatment.set(null);
    this.selectedPatientForQuote.set(null);
    this.selectedPatientForInvite.set(null);
    this.selectedPatientForClinicalRecord.set(null);
  }

  protected onHistoryClose(): void {
    this.selectedPatientForHistory.set(null);
  }

  protected onBuildQuote(patientId: string): void {
    this.selectedPatientForQuote.set(patientId);
    this.selectedUserId.set(null);
    this.selectedPatientId.set(null);
    this.selectedPatientForDiagnosis.set(null);
    this.selectedPatientForTreatment.set(null);
    this.selectedPatientForHistory.set(null);
    this.selectedPatientForInvite.set(null);
    this.selectedPatientForClinicalRecord.set(null);
  }

  protected onQuoteClose(): void {
    this.selectedPatientForQuote.set(null);
  }

  protected onSendInvite(payload: PatientInviteContact): void {
    this.selectedPatientForInvite.set(payload);
    this.selectedUserId.set(null);
    this.selectedPatientId.set(null);
    this.selectedPatientForDiagnosis.set(null);
    this.selectedPatientForTreatment.set(null);
    this.selectedPatientForHistory.set(null);
    this.selectedPatientForQuote.set(null);
    this.selectedPatientForClinicalRecord.set(null);
  }

  protected onInviteSent(channel: InviteChannel): void {
    this.selectedPatientForInvite.set(null);
    this.showInviteSuccess(INVITE_SUCCESS_MESSAGE[channel]);
  }

  protected onInviteCancel(): void {
    this.selectedPatientForInvite.set(null);
  }

  protected dismissInviteSuccess(): void {
    this.inviteSuccessMessage.set(null);
    if (this.inviteSuccessTimeout !== null) {
      clearTimeout(this.inviteSuccessTimeout);
      this.inviteSuccessTimeout = null;
    }
  }

  private showInviteSuccess(message: string): void {
    if (this.inviteSuccessTimeout !== null) {
      clearTimeout(this.inviteSuccessTimeout);
    }
    this.inviteSuccessMessage.set(message);
    this.inviteSuccessTimeout = setTimeout(() => {
      this.inviteSuccessMessage.set(null);
      this.inviteSuccessTimeout = null;
    }, 6000);
  }
}
