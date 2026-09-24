import { Component, ChangeDetectionStrategy, inject, signal, computed, OnInit } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { AdminDoctorsService } from '../../services/admin-doctors.service';
import { BookingService } from '../../../booking/services/booking.service';
import { DoctorPickerComponent } from '../../../booking/components/doctor-picker/doctor-picker';
import { DoctorAgendaComponent } from '../../../appointments/components/doctor-agenda/doctor-agenda';
import { PatientsListComponent } from '../../../patients/components/patients-list/patients-list';
import { AdminDoctorInvitePanelComponent } from '../admin-doctor-invite-panel/admin-doctor-invite-panel';
import { PhoneInputComponent } from '../../../../shared/ui/phone-input/phone-input';
import { DOCTOR_COLOR_PALETTE } from '../../../../shared/constants/doctor-colors';
import { field, allValid, touchAll } from '../../../../shared/validation/field';
import { requiredTextError, optionalTextError, normalizeText } from '../../../../shared/validation/text.validator';
import { isValidEmail, normalizeEmail } from '../../../../shared/validation/email.validator';
import {
  normalizeFullName,
  validatePersonName,
  PERSON_NAME_MAX_LENGTH,
} from '../../../../shared/validation/full-name.validator';
import type { AdminDoctorSummary } from '../../models/admin-doctor.model';
import type { CreateDoctorRequest, UpdateDoctorRequest } from '../../models/admin-doctor.request';
import type { Doctor } from '../../../booking/models/booking.model';
import type { InviteChannel } from '../../../patient-invites/services/patient-invites.service';
import { PageHeaderComponent } from '../../../../shared/ui/page-header/page-header';

const WEEKDAY_LABELS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

const DISPLAY_NAME_MAX_LENGTH = 200;
const SPECIALTY_MAX_LENGTH = 150;
const BIO_MAX_LENGTH = 2000;

type ViewMode = 'list' | 'create' | 'edit' | 'detail' | 'invite';
type DetailTab = 'agenda' | 'patients';
/** CLI-110: ver un doctor a la vez, o la agenda común de todos. */
type DetailView = 'doctor' | 'all';

interface ScheduleBlockDraft {
  weekday: number;
  start: string;
  end: string;
}

/** "" (todavía no tipeó nada) o "+591" (nada más que el indicativo) = no cargó teléfono — mismo criterio que step-patient-data.ts. */
function isBareCallingCode(e164: string): boolean {
  return e164 === '' || /^\+\d{1,3}$/.test(e164);
}

// Mismo mínimo que MinLength(3) del CreateDoctorDto (idéntico al de pacientes).
const MIN_NAME_LENGTH = 3;

/** Regla de nombre/apellido del doctor: `required` en el alta, opcional al editar (los doctores cargados antes de CLI-76 no los tienen). */
function personNameError(value: string, label: string, required: boolean): string | null {
  if (!value.trim()) return required ? `${label} es obligatorio.` : null;
  const err = validatePersonName(value);
  if (err === 'invalid-chars') return `${label} solo puede tener letras.`;
  if (err === 'too-long') return `${label} no puede superar los ${PERSON_NAME_MAX_LENGTH} caracteres.`;
  if (normalizeFullName(value).length < MIN_NAME_LENGTH) {
    return `${label} tiene que tener al menos ${MIN_NAME_LENGTH} caracteres.`;
  }
  return null;
}

/** Solo el formato: el email ya no es obligatorio por sí solo, alcanza con un contacto (email o teléfono) — ver `contactMissing`. */
function emailFieldError(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!isValidEmail(trimmed)) return 'El email no es válido.';
  return null;
}

/** Sugerencia para el nombre público: el admin elige Dr. o Dra. y lo ajusta a mano. */
function suggestPublicName(firstName: string, lastNamePaternal: string): string {
  const parts = [normalizeFullName(firstName), normalizeFullName(lastNamePaternal)].filter(Boolean);
  return parts.length > 0 ? `Dr./Dra. ${parts.join(' ')}` : '';
}

@Component({
  selector: 'app-admin-doctors',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PageHeaderComponent, 
    FormsModule,
    PhoneInputComponent,
    AdminDoctorInvitePanelComponent,
    DoctorPickerComponent,
    DoctorAgendaComponent,
    PatientsListComponent,
  ],
  templateUrl: './admin-doctors.html',
  styleUrl: './admin-doctors.scss',
})
export class AdminDoctorsComponent implements OnInit {
  private readonly adminDoctorsService = inject(AdminDoctorsService);
  private readonly bookingService = inject(BookingService);

  protected readonly weekdayLabels = WEEKDAY_LABELS;

  protected readonly doctors = signal<AdminDoctorSummary[]>([]);
  protected readonly loading = signal(false);
  protected readonly loadError = signal<string | null>(null);

  protected readonly mode = signal<ViewMode>('list');
  protected readonly editingId = signal<string | null>(null);

  protected readonly firstNameField = field<string>('', (v) =>
    personNameError(v, 'El nombre', this.mode() === 'create'),
  );
  protected readonly lastNamePaternalField = field<string>('', (v) =>
    personNameError(v, 'El apellido paterno', this.mode() === 'create'),
  );
  protected readonly lastNameMaternalField = field<string>('', (v) => personNameError(v, 'El apellido materno', false));
  protected readonly displayNameField = field<string>('', (v) => requiredTextError(v, DISPLAY_NAME_MAX_LENGTH));
  protected readonly emailField = field<string>('', emailFieldError);
  protected readonly specialtyField = field<string>('', (v) => optionalTextError(v, SPECIALTY_MAX_LENGTH));
  protected readonly bioField = field<string>('', (v) => optionalTextError(v, BIO_MAX_LENGTH));
  protected readonly photoUrl = signal('');
  protected readonly displayOrder = signal<number | null>(null);
  /** Color en la agenda común — solo se edita (el alta asigna uno libre automáticamente, CLI-110). */
  protected readonly doctorColor = signal<string | null>(null);
  protected readonly colorPalette = DOCTOR_COLOR_PALETTE;
  protected readonly phoneE164 = signal('');
  protected readonly phoneOk = signal(true);
  protected readonly scheduleBlocks = signal<ScheduleBlockDraft[]>([]);

  // Mientras el admin no toque el nombre público a mano, se va armando solo con nombre + apellido paterno.
  private readonly publicNameEdited = signal(false);
  protected readonly contactAttempted = signal(false);

  // Paso 2 del alta (y "Enviar invitación" desde la lista): el doctor al que se le manda el link.
  protected readonly invitingDoctor = signal<AdminDoctorSummary | null>(null);

  protected readonly submitting = signal(false);
  protected readonly formError = signal<string | null>(null);
  protected readonly successMessage = signal<string | null>(null);
  private successTimeout: ReturnType<typeof setTimeout> | null = null;

  protected readonly confirmingDeactivateFor = signal<string | null>(null);
  protected readonly deactivating = signal(false);

  // CLI-64: vista de detalle de solo lectura — agenda y pacientes de un
  // doctor elegido, reusando el mismo picker que alimenta /reservar.
  protected readonly pickerDoctors = signal<Doctor[]>([]);
  protected readonly pickerLoading = signal(false);
  protected readonly selectedDoctorId = signal<string | null>(null);
  protected readonly detailTab = signal<DetailTab>('agenda');
  protected readonly detailView = signal<DetailView>('doctor');

  /** Alcanza con un contacto: la invitación sale por email o por WhatsApp. */
  protected readonly contactMissing = computed(
    () => this.emailField.value().trim() === '' && isBareCallingCode(this.phoneE164()),
  );

  protected readonly formValid = computed(
    () =>
      allValid(
        this.firstNameField,
        this.lastNamePaternalField,
        this.lastNameMaternalField,
        this.displayNameField,
        this.specialtyField,
        this.bioField,
      ) &&
      this.emailField.error() === null &&
      this.phoneOk() &&
      !this.contactMissing(),
  );

  ngOnInit(): void {
    void this.loadDoctors();
    void this.loadPickerDoctors();
  }

  private async loadDoctors(): Promise<void> {
    this.loading.set(true);
    this.loadError.set(null);
    try {
      const result = await firstValueFrom(this.adminDoctorsService.getAll());
      this.doctors.set(result);
    } catch {
      this.loadError.set('No se pudo cargar la lista de doctores.');
    } finally {
      this.loading.set(false);
    }
  }

  private async loadPickerDoctors(): Promise<void> {
    this.pickerLoading.set(true);
    try {
      const result = await firstValueFrom(this.bookingService.getDoctors());
      this.pickerDoctors.set(result);
    } catch {
      this.pickerDoctors.set([]);
    } finally {
      this.pickerLoading.set(false);
    }
  }

  protected openDetail(doctorId?: string): void {
    this.confirmingDeactivateFor.set(null);
    this.selectedDoctorId.set(doctorId ?? null);
    this.detailTab.set('agenda');
    this.detailView.set('doctor');
    this.mode.set('detail');
  }

  protected closeDetail(): void {
    this.mode.set('list');
    this.selectedDoctorId.set(null);
  }

  protected onPickerSelect(doctorId: string): void {
    this.selectedDoctorId.set(doctorId);
  }

  protected setDetailTab(tab: DetailTab): void {
    this.detailTab.set(tab);
  }

  protected setDetailView(view: DetailView): void {
    this.detailView.set(view);
  }

  protected onColorPick(color: string): void {
    this.doctorColor.set(color.toLowerCase());
  }

  protected openCreate(): void {
    this.resetForm();
    this.publicNameEdited.set(false);
    this.formError.set(null);
    this.mode.set('create');
  }

  protected async openEdit(doctorId: string): Promise<void> {
    this.confirmingDeactivateFor.set(null);
    this.formError.set(null);
    try {
      const detail = await firstValueFrom(this.adminDoctorsService.getById(doctorId));
      this.resetForm();
      this.firstNameField.reset(detail.firstName ?? '');
      this.lastNamePaternalField.reset(detail.lastNamePaternal ?? '');
      this.lastNameMaternalField.reset(detail.lastNameMaternal ?? '');
      this.displayNameField.reset(detail.displayName ?? '');
      this.emailField.reset(detail.email ?? '');
      this.phoneE164.set(detail.phone ?? '');
      this.specialtyField.reset(detail.specialty ?? '');
      this.bioField.reset(detail.bio ?? '');
      this.photoUrl.set(detail.photoUrl ?? '');
      this.displayOrder.set(detail.displayOrder);
      this.doctorColor.set(detail.color);
      this.scheduleBlocks.set(detail.scheduleBlocks.map((b) => ({ ...b })));
      this.editingId.set(doctorId);
      this.publicNameEdited.set(true);
      this.mode.set('edit');
    } catch {
      this.formError.set('No se pudo cargar los datos del doctor.');
    }
  }

  protected closeForm(): void {
    this.mode.set('list');
    this.editingId.set(null);
    this.resetForm();
  }

  private resetForm(): void {
    this.firstNameField.reset('');
    this.lastNamePaternalField.reset('');
    this.lastNameMaternalField.reset('');
    this.displayNameField.reset('');
    this.emailField.reset('');
    this.phoneE164.set('');
    this.phoneOk.set(true);
    this.specialtyField.reset('');
    this.bioField.reset('');
    this.photoUrl.set('');
    this.displayOrder.set(null);
    this.doctorColor.set(null);
    this.scheduleBlocks.set([]);
    this.formError.set(null);
    this.contactAttempted.set(false);
  }

  protected onNamePartInput(target: 'first' | 'paternal', event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    (target === 'first' ? this.firstNameField : this.lastNamePaternalField).set(value);
    if (this.mode() === 'create' && !this.publicNameEdited()) {
      this.displayNameField.set(suggestPublicName(this.firstNameField.value(), this.lastNamePaternalField.value()));
    }
  }

  protected onPublicNameInput(event: Event): void {
    this.publicNameEdited.set(true);
    this.displayNameField.set((event.target as HTMLInputElement).value);
  }

  protected onPhoneChange(event: { e164: string; valid: boolean }): void {
    this.phoneE164.set(event.e164);
    this.phoneOk.set(event.valid || isBareCallingCode(event.e164));
  }

  protected onDisplayOrderInput(event: Event): void {
    const raw = (event.target as HTMLInputElement).value;
    this.displayOrder.set(raw === '' ? null : Number(raw));
  }

  protected addScheduleBlock(): void {
    this.scheduleBlocks.update((blocks) => [...blocks, { weekday: 1, start: '09:00', end: '12:00' }]);
  }

  protected removeScheduleBlock(index: number): void {
    this.scheduleBlocks.update((blocks) => blocks.filter((_, i) => i !== index));
  }

  protected setBlockWeekday(index: number, event: Event): void {
    const weekday = Number((event.target as HTMLSelectElement).value);
    this.scheduleBlocks.update((blocks) => blocks.map((b, i) => (i === index ? { ...b, weekday } : b)));
  }

  protected setBlockStart(index: number, event: Event): void {
    const start = (event.target as HTMLInputElement).value;
    this.scheduleBlocks.update((blocks) => blocks.map((b, i) => (i === index ? { ...b, start } : b)));
  }

  protected setBlockEnd(index: number, event: Event): void {
    const end = (event.target as HTMLInputElement).value;
    this.scheduleBlocks.update((blocks) => blocks.map((b, i) => (i === index ? { ...b, end } : b)));
  }

  protected async submit(): Promise<void> {
    this.contactAttempted.set(true);
    touchAll(
      this.firstNameField,
      this.lastNamePaternalField,
      this.lastNameMaternalField,
      this.displayNameField,
      this.emailField,
      this.specialtyField,
      this.bioField,
    );
    if (!this.formValid()) {
      return;
    }

    this.submitting.set(true);
    this.formError.set(null);
    try {
      const shared = {
        displayName: normalizeText(this.displayNameField.value()),
        email: normalizeEmail(this.emailField.value()) || undefined,
        phone: isBareCallingCode(this.phoneE164()) ? undefined : this.phoneE164(),
        specialty: this.specialtyField.value().trim() || undefined,
        bio: this.bioField.value().trim() || undefined,
        photoUrl: this.photoUrl().trim() || undefined,
        displayOrder: this.displayOrder() ?? undefined,
        scheduleBlocks: this.scheduleBlocks().map((b) => ({ weekday: b.weekday, start: b.start, end: b.end })),
      };

      const firstName = normalizeFullName(this.firstNameField.value());
      const lastNamePaternal = normalizeFullName(this.lastNamePaternalField.value());
      const lastNameMaternal = normalizeFullName(this.lastNameMaternalField.value()) || undefined;

      if (this.mode() === 'create') {
        const request: CreateDoctorRequest = { ...shared, firstName, lastNamePaternal, lastNameMaternal };
        const result = await firstValueFrom(this.adminDoctorsService.create(request));
        this.closeForm();
        await this.loadDoctors();
        // Paso 2: el doctor ya existe como pendiente, ahora se elige cómo mandarle el link.
        this.openInvite(result.doctor);
      } else {
        const id = this.editingId();
        if (!id) {
          return;
        }
        // Un doctor cargado antes de CLI-76 puede seguir editándose sin nombre/apellidos: vacío = no tocar.
        const request: UpdateDoctorRequest = {
          ...shared,
          color: this.doctorColor() ?? undefined,
          firstName: firstName || undefined,
          lastNamePaternal: lastNamePaternal || undefined,
          lastNameMaternal,
        };
        await firstValueFrom(this.adminDoctorsService.update(id, request));
        this.closeForm();
        await this.loadDoctors();
        this.showSuccess('Doctor actualizado correctamente.');
      }
    } catch (error) {
      this.formError.set(this.messageFor(error));
    } finally {
      this.submitting.set(false);
    }
  }

  /** Abre el paso "Enviar invitación" para un doctor pendiente (recién creado o desde la lista). */
  protected openInvite(doctor: AdminDoctorSummary): void {
    this.confirmingDeactivateFor.set(null);
    this.invitingDoctor.set(doctor);
    this.mode.set('invite');
  }

  protected closeInvite(): void {
    this.invitingDoctor.set(null);
    this.mode.set('list');
  }

  protected onInviteSent(channel: InviteChannel): void {
    this.closeInvite();
    this.showSuccess(
      channel === 'email'
        ? 'Invitación enviada por email.'
        : 'Se abrió WhatsApp con el mensaje listo para enviar.',
    );
  }

  /** "Editar datos de contacto" desde el panel de invitación: vuelve al form de edición de ese doctor. */
  protected async editInvitedDoctor(): Promise<void> {
    const doctor = this.invitingDoctor();
    if (!doctor) {
      return;
    }
    this.closeInvite();
    await this.openEdit(doctor.id);
  }

  /** Estado que ve el admin en la lista: la baja pesa más que el registro, y el registro más que la reserva. */
  protected statusOf(doctor: AdminDoctorSummary): 'inactive' | 'pending' | 'unbookable' | 'active' {
    if (!doctor.isActive) return 'inactive';
    if (doctor.registrationStatus === 'pending') return 'pending';
    return doctor.isBookable ? 'active' : 'unbookable';
  }

  protected requestDeactivate(doctorId: string): void {
    this.confirmingDeactivateFor.set(doctorId);
  }

  protected cancelDeactivate(): void {
    this.confirmingDeactivateFor.set(null);
  }

  protected async confirmDeactivate(doctorId: string): Promise<void> {
    this.deactivating.set(true);
    try {
      await firstValueFrom(this.adminDoctorsService.deactivate(doctorId));
      this.confirmingDeactivateFor.set(null);
      await this.loadDoctors();
      this.showSuccess('Doctor dado de baja.');
    } catch {
      this.loadError.set('No se pudo dar de baja al doctor.');
    } finally {
      this.deactivating.set(false);
    }
  }

  private showSuccess(message: string): void {
    if (this.successTimeout !== null) {
      clearTimeout(this.successTimeout);
    }
    this.successMessage.set(message);
    this.successTimeout = setTimeout(() => {
      this.successMessage.set(null);
      this.successTimeout = null;
    }, 6000);
  }

  private messageFor(error: unknown): string {
    if (error instanceof HttpErrorResponse && error.status === 409) {
      return 'Ya existe un usuario con ese email.';
    }
    return 'Ocurrió un error. Intentá nuevamente.';
  }
}
