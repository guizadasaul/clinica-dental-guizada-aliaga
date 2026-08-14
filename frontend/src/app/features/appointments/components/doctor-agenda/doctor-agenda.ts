import { Component, ChangeDetectionStrategy, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AppointmentsService } from '../../services/appointments.service';
import { PatientQuickEditComponent } from '../patient-quick-edit/patient-quick-edit';
import { PatientWizardComponent } from '../../../patients/components/patient-wizard/patient-wizard';
import { SendInviteComponent } from '../send-invite/send-invite';
import type { AppointmentAgendaItem } from '../../models/appointment.model';

const TIME_FORMATTER = new Intl.DateTimeFormat('es-BO', {
  timeZone: 'America/La_Paz',
  weekday: 'short',
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

@Component({
  selector: 'app-doctor-agenda',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PatientQuickEditComponent, PatientWizardComponent, SendInviteComponent],
  templateUrl: './doctor-agenda.html',
  styleUrl: './doctor-agenda.scss',
})
export class DoctorAgendaComponent {
  private readonly appointmentsService = inject(AppointmentsService);

  protected readonly appointments = signal<AppointmentAgendaItem[]>([]);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly editingAppointment = signal<AppointmentAgendaItem | null>(null);
  protected readonly historyPatientId = signal<string | null>(null);
  protected readonly invitingAppointment = signal<AppointmentAgendaItem | null>(null);

  constructor() {
    void this.load();
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const result = await firstValueFrom(
        this.appointmentsService.getAgenda({ status: 'confirmed' }),
      );
      this.appointments.set(result);
    } catch {
      this.error.set('No pudimos cargar la agenda.');
    } finally {
      this.loading.set(false);
    }
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

  protected onEdit(a: AppointmentAgendaItem): void {
    if (!a.patientId) {
      return;
    }
    this.editingAppointment.set(a);
    this.historyPatientId.set(null);
    this.invitingAppointment.set(null);
  }

  protected onOpenHistory(a: AppointmentAgendaItem): void {
    if (!a.patientId) {
      return;
    }
    this.historyPatientId.set(a.patientId);
    this.editingAppointment.set(null);
    this.invitingAppointment.set(null);
  }

  protected onInvite(a: AppointmentAgendaItem): void {
    if (!a.patientId) {
      return;
    }
    this.invitingAppointment.set(a);
    this.editingAppointment.set(null);
    this.historyPatientId.set(null);
  }

  protected onEditSaved(): void {
    this.editingAppointment.set(null);
    void this.load();
  }

  protected onEditCancel(): void {
    this.editingAppointment.set(null);
  }

  protected onHistoryDone(): void {
    this.historyPatientId.set(null);
    void this.load();
  }

  protected onInviteSent(): void {
    this.invitingAppointment.set(null);
  }

  protected onInviteCancel(): void {
    this.invitingAppointment.set(null);
  }
}
