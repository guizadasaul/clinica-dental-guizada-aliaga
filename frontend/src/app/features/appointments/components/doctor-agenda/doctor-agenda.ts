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

const DAY_LABEL_FORMATTER = new Intl.DateTimeFormat('es-BO', {
  timeZone: 'America/La_Paz',
  weekday: 'short',
  day: '2-digit',
  month: 'short',
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

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).replace(/\.$/, '');
}

function formatDayLabel(dateStr: string): string {
  const parts = DAY_LABEL_FORMATTER.formatToParts(new Date(`${dateStr}T12:00:00-04:00`));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${capitalize(get('weekday'))} ${get('day')} ${capitalize(get('month'))}`;
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

  protected readonly appointments = signal<AppointmentAgendaItem[]>([]);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly historyPatientId = signal<string | null>(null);

  protected readonly selectedDate = signal(laPazDateString(new Date()));
  protected readonly selectedDateLabel = computed(() => formatDayLabel(this.selectedDate()));
  protected readonly isToday = computed(
    () => this.selectedDate() === laPazDateString(new Date()),
  );

  constructor() {
    void this.load();
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const from = this.selectedDate();
      const to = addDaysToDateString(from, 1);
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

  protected onPrevDay(): void {
    this.selectedDate.set(addDaysToDateString(this.selectedDate(), -1));
    void this.load();
  }

  protected onNextDay(): void {
    this.selectedDate.set(addDaysToDateString(this.selectedDate(), 1));
    void this.load();
  }

  protected onToday(): void {
    this.selectedDate.set(laPazDateString(new Date()));
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
