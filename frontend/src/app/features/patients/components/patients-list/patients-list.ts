import {
  Component,
  ChangeDetectionStrategy,
  inject,
  output,
  signal,
  computed,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { PatientsService } from '../../services/patients.service';
import type { PatientWithUser } from '../../models/patient.model';

@Component({
  selector: 'app-patients-list',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './patients-list.html',
  styleUrl: './patients-list.scss',
})
export class PatientsListComponent {
  private readonly patientsService = inject(PatientsService);

  readonly startWizard = output<string>();
  readonly openOdontogram = output<string>();
  readonly registerTreatment = output<string>();
  readonly viewHistory = output<string>();

  protected readonly patients = toSignal(
    this.patientsService.getAll(),
    { initialValue: [] as PatientWithUser[] },
  );

  protected readonly filter = signal('');

  protected readonly filtered = computed(() => {
    const q = this.filter().toLowerCase().trim();
    if (!q) { return this.patients(); }
    return this.patients().filter((p) => {
      const name = (p.displayName ?? '').toLowerCase();
      const email = (p.email ?? '').toLowerCase();
      const dni = (p.patient?.dni ?? '').toLowerCase();
      return name.includes(q) || email.includes(q) || dni.includes(q);
    });
  });

  protected fullName(p: PatientWithUser): string {
    if (p.patient) {
      return `${p.patient.firstName} ${p.patient.lastNamePaternal}${p.patient.lastNameMaternal ? ' ' + p.patient.lastNameMaternal : ''}`;
    }
    return p.displayName ?? 'Sin nombre';
  }

  protected onRegister(userId: string): void {
    this.startWizard.emit(userId);
  }

  protected onOpenOdontogram(patientId: string): void {
    this.openOdontogram.emit(patientId);
  }

  protected onRegisterTreatment(patientId: string): void {
    this.registerTreatment.emit(patientId);
  }

  protected onViewHistory(patientId: string): void {
    this.viewHistory.emit(patientId);
  }
}
