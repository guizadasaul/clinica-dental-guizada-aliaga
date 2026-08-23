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
import type { Patient, PatientWithUser, PatientInviteContact } from '../../models/patient.model';

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
  // Emite el Patient completo (no solo el id): step-patient-data lo usa para
  // precargar el paso 1 en vez de abrirlo en blanco sobre una ficha existente
  // ("Registrar diagnóstico" no crea un paciente, edita uno que ya tiene datos).
  readonly registerDiagnosis = output<Patient>();
  readonly viewClinicalRecord = output<Patient>();
  readonly registerTreatment = output<string>();
  readonly viewHistory = output<string>();
  readonly buildQuote = output<string>();
  readonly sendInvite = output<PatientInviteContact>();

  protected readonly openMenuFor = signal<string | null>(null);
  // El menú se posiciona con `fixed` + coordenadas calculadas en JS (no
  // `absolute` dentro de la fila) porque `.patients-list__table-wrap` tiene
  // `overflow-x: auto` — por spec de CSS eso fuerza `overflow-y` a `auto`
  // también, así que cualquier menú `absolute` que se quisiera salir de esa
  // caja quedaba recortado.
  protected readonly menuPosition = signal<{ top: number; right: number } | null>(null);

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    if (!target.closest('.patients-list__menu-wrap')) {
      this.openMenuFor.set(null);
      this.menuPosition.set(null);
    }
  }

  // El menú es `fixed`, con coordenadas calculadas al abrirlo — si la página
  // (o la tabla, que scrollea horizontal) se mueve mientras está abierto,
  // esas coordenadas quedan desactualizadas. Más simple cerrarlo que
  // recalcular en cada scroll.
  @HostListener('window:scroll')
  onWindowScroll(): void {
    if (this.openMenuFor() !== null) {
      this.openMenuFor.set(null);
      this.menuPosition.set(null);
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

  protected onRegisterDiagnosis(patient: Patient): void {
    this.openMenuFor.set(null);
    this.registerDiagnosis.emit(patient);
  }

  protected onViewClinicalRecord(patient: Patient): void {
    this.openMenuFor.set(null);
    this.viewClinicalRecord.emit(patient);
  }

  protected toggleMenu(userId: string, trigger: HTMLElement): void {
    const isClosing = this.openMenuFor() === userId;
    this.openMenuFor.set(isClosing ? null : userId);
    if (isClosing) {
      this.menuPosition.set(null);
      return;
    }
    const rect = trigger.getBoundingClientRect();
    this.menuPosition.set({
      top: rect.bottom + 8,
      right: window.innerWidth - rect.right,
    });
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
