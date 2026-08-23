import {
  Component,
  ChangeDetectionStrategy,
  HostListener,
  inject,
  output,
  signal,
  computed,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { PatientsService } from '../../services/patients.service';
import type { PatientWithUser, PatientInviteContact } from '../../models/patient.model';

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
  readonly registerDiagnosis = output<string>();
  readonly viewClinicalRecord = output<string>();
  readonly registerTreatment = output<string>();
  readonly viewHistory = output<string>();
  readonly buildQuote = output<string>();
  readonly sendInvite = output<PatientInviteContact>();

  protected readonly openMenuFor = signal<string | null>(null);

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    if (!target.closest('.patients-list__menu-wrap')) {
      this.openMenuFor.set(null);
    }
  }

  protected readonly patients = toSignal(
    this.patientsService.getAll(),
    { initialValue: [] as PatientWithUser[] },
  );

  protected readonly filter = signal('');

  protected readonly filtered = computed(() => {
    const q = this.filter().toLowerCase().trim();
    if (!q) { return this.patients(); }
    return this.patients().filter((p) => {
      const name = this.fullName(p).toLowerCase();
      const phone = this.phoneLabel(p).toLowerCase();
      return name.includes(q) || phone.includes(q);
    });
  });

  protected fullName(p: PatientWithUser): string {
    if (p.patient) {
      return `${p.patient.firstName} ${p.patient.lastNamePaternal}${p.patient.lastNameMaternal ? ' ' + p.patient.lastNameMaternal : ''}`;
    }
    return p.displayName ?? 'Sin nombre';
  }

  protected phoneLabel(p: PatientWithUser): string {
    return p.patient?.phone ?? p.phone ?? '—';
  }

  protected onRegister(userId: string): void {
    this.startWizard.emit(userId);
  }

  protected onOpenOdontogram(patientId: string): void {
    this.openMenuFor.set(null);
    this.openOdontogram.emit(patientId);
  }

  protected onRegisterDiagnosis(patientId: string): void {
    this.openMenuFor.set(null);
    this.registerDiagnosis.emit(patientId);
  }

  protected onViewClinicalRecord(patientId: string): void {
    this.openMenuFor.set(null);
    this.viewClinicalRecord.emit(patientId);
  }

  protected toggleMenu(userId: string): void {
    this.openMenuFor.update((current) => (current === userId ? null : userId));
  }

  protected onRegisterTreatment(patientId: string): void {
    this.registerTreatment.emit(patientId);
  }

  protected onViewHistory(patientId: string): void {
    this.viewHistory.emit(patientId);
  }

  protected onBuildQuote(patientId: string): void {
    this.buildQuote.emit(patientId);
  }

  protected onSendInvite(p: PatientWithUser): void {
    if (!p.patient) {
      return;
    }
    this.sendInvite.emit({
      patientId: p.patient.id,
      firstName: p.patient.firstName,
      lastNamePaternal: p.patient.lastNamePaternal,
      phone: p.patient.phone,
      email: p.email,
    });
  }
}
