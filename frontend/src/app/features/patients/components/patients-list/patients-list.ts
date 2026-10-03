import {
  Component,
  ChangeDetectionStrategy,
  HostListener,
  inject,
  input,
  output,
  signal,
  computed,
  effect,
  untracked,
  OnInit,
} from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { PatientsService } from '../../services/patients.service';
import { BookingService } from '../../../booking/services/booking.service';
import { AuthService } from '../../../../auth/application/auth.service';
import type { Patient, PatientWithUser, PatientInviteContact } from '../../models/patient.model';
import type { Doctor } from '../../../booking/models/booking.model';
import { PageHeaderComponent } from '../../../../shared/ui/page-header/page-header';
import { PatientDeleteDialogComponent } from '../patient-delete-dialog/patient-delete-dialog';

@Component({
  selector: 'app-patients-list',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PageHeaderComponent, PatientDeleteDialogComponent],
  templateUrl: './patients-list.html',
  styleUrl: './patients-list.scss',
})
export class PatientsListComponent implements OnInit {
  private readonly patientsService = inject(PatientsService);
  private readonly bookingService = inject(BookingService);
  private readonly authService = inject(AuthService);

  // CLI-64: panel de admin viendo a un doctor puntual — reemplaza la lógica
  // de onlyMine y oculta el toggle "Solo mis pacientes" (no aplica en modo
  // admin). readOnly apaga el menú de acciones por fila entero.
  readonly forcedDoctorId = input<string | null>(null);
  readonly readOnly = input(false);

  readonly startWizard = output<string>();
  /** "Nuevo paciente": alguien que llegó sin reserva previa (CLI-171). */
  readonly newPatient = output<void>();
  readonly openOdontogram = output<string>();
  /** Diagnóstico nuevo desde cero para un paciente que ya tiene uno (CLI-109). */
  readonly newDiagnosis = output<string>();
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

  // Baja lógica (CLI-184): el paciente que se está por eliminar y el estado de la llamada.
  protected readonly deleting = signal<PatientWithUser | null>(null);
  protected readonly deleteBusy = signal(false);
  protected readonly deleteError = signal<string | null>(null);

  protected readonly patients = signal<PatientWithUser[]>([]);
  protected readonly doctors = signal<Doctor[]>([]);
  // Conveniencia de UI, no de seguridad — sin filtrar, la lista sigue
  // trayendo a todos los pacientes (visibilidad compartida, CLI-58).
  protected readonly onlyMine = signal(false);

  constructor() {
    // Reactivo a forcedDoctorId (no a onlyMine, que ya dispara su propio
    // reload explícito desde toggleOnlyMine) — cambia cuando el admin elige
    // otro doctor desde el panel sin desmontar el componente.
    effect(
      () => {
        this.forcedDoctorId();
        untracked(() => void this.loadPatients());
      },
      { allowSignalWrites: true },
    );
  }

  ngOnInit(): void {
    void this.loadDoctors();
  }

  protected askDelete(patient: PatientWithUser): void {
    this.openMenuFor.set(null);
    this.menuPosition.set(null);
    this.deleteError.set(null);
    this.deleting.set(patient);
  }

  protected cancelDelete(): void {
    this.deleting.set(null);
    this.deleteError.set(null);
  }

  protected async confirmDelete(): Promise<void> {
    const target = this.deleting();
    if (!target || this.deleteBusy()) {
      return;
    }
    this.deleteBusy.set(true);
    this.deleteError.set(null);
    try {
      await firstValueFrom(this.patientsService.deletePatient(target.userId));
      this.deleting.set(null);
      await this.loadPatients();
    } catch (err) {
      // Los rechazos (citas futuras, saldo) traen el motivo en el mensaje de la API.
      const message = (err as { error?: { message?: unknown } })?.error?.message;
      this.deleteError.set(
        typeof message === 'string' && message.trim()
          ? message
          : 'No se pudo eliminar al paciente. Intenta de nuevo.',
      );
    } finally {
      this.deleteBusy.set(false);
    }
  }

  private async loadPatients(): Promise<void> {
    const forcedDoctorId = this.forcedDoctorId();
    const myDoctorId = this.authService.currentUser()?.id ?? undefined;
    const doctorId = forcedDoctorId ?? (this.onlyMine() ? myDoctorId : undefined);
    const result = await firstValueFrom(this.patientsService.getAll(doctorId ?? undefined));
    this.patients.set(result);
  }

  private async loadDoctors(): Promise<void> {
    try {
      const result = await firstValueFrom(this.bookingService.getDoctors());
      this.doctors.set(result);
    } catch {
      this.doctors.set([]);
    }
  }

  protected toggleOnlyMine(): void {
    this.onlyMine.update((v) => !v);
    void this.loadPatients();
  }

  protected doctorName(doctorId: string | null | undefined): string {
    if (!doctorId) {
      return 'Sin asignar';
    }
    return this.doctors().find((d) => d.id === doctorId)?.displayName ?? 'Sin asignar';
  }

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

  protected onNewDiagnosis(patientId: string): void {
    this.openMenuFor.set(null);
    this.newDiagnosis.emit(patientId);
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

  /** Tratamiento y presupuesto solo con ficha y diagnóstico terminado (CLI-189); no depende de la cuenta. */
  protected canTreat(p: PatientWithUser): boolean {
    return !!p.patient && p.dentalExamsCount > 0;
  }

  protected onMenuRegisterTreatment(p: PatientWithUser): void {
    this.closeMenu();
    if (p.patient && this.canTreat(p)) {
      this.registerTreatment.emit(p.patient.id);
    }
  }

  protected onMenuBuildQuote(p: PatientWithUser): void {
    this.closeMenu();
    if (p.patient && this.canTreat(p)) {
      this.buildQuote.emit(p.patient.id);
    }
  }

  private closeMenu(): void {
    this.openMenuFor.set(null);
    this.menuPosition.set(null);
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
