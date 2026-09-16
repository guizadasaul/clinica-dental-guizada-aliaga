import { Component, ChangeDetectionStrategy, inject, signal, computed } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { AdminDoctorsService } from '../../services/admin-doctors.service';
import { BookingService } from '../../../booking/services/booking.service';
import { DoctorPickerComponent } from '../../../booking/components/doctor-picker/doctor-picker';
import { DoctorAgendaComponent } from '../../../appointments/components/doctor-agenda/doctor-agenda';
import { PatientsListComponent } from '../../../patients/components/patients-list/patients-list';
import { PhoneInputComponent } from '../../../../shared/ui/phone-input/phone-input';
import { field, allValid, touchAll } from '../../../../shared/validation/field';
import { requiredTextError, optionalTextError, normalizeText } from '../../../../shared/validation/text.validator';
import { isValidEmail, normalizeEmail } from '../../../../shared/validation/email.validator';
import type { AdminDoctorSummary } from '../../models/admin-doctor.model';
import type { CreateDoctorRequest, UpdateDoctorRequest } from '../../models/admin-doctor.request';
import type { Doctor } from '../../../booking/models/booking.model';

const WEEKDAY_LABELS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

const DISPLAY_NAME_MAX_LENGTH = 200;
const SPECIALTY_MAX_LENGTH = 150;
const BIO_MAX_LENGTH = 2000;

type ViewMode = 'list' | 'create' | 'edit' | 'detail';
type DetailTab = 'agenda' | 'patients';

interface ScheduleBlockDraft {
  weekday: number;
  start: string;
  end: string;
}

/** "" (todavía no tipeó nada) o "+591" (nada más que el indicativo) = no cargó teléfono — mismo criterio que step-patient-data.ts. */
function isBareCallingCode(e164: string): boolean {
  return e164 === '' || /^\+\d{1,3}$/.test(e164);
}

function emailFieldError(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return 'El email es obligatorio.';
  if (!isValidEmail(trimmed)) return 'El email no es válido.';
  return null;
}

@Component({
  selector: 'app-admin-doctors',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, PhoneInputComponent, DoctorPickerComponent, DoctorAgendaComponent, PatientsListComponent],
  templateUrl: './admin-doctors.html',
  styleUrl: './admin-doctors.scss',
})
export class AdminDoctorsComponent {
  private readonly adminDoctorsService = inject(AdminDoctorsService);
  private readonly bookingService = inject(BookingService);

  protected readonly weekdayLabels = WEEKDAY_LABELS;

  protected readonly doctors = signal<AdminDoctorSummary[]>([]);
  protected readonly loading = signal(false);
  protected readonly loadError = signal<string | null>(null);

  protected readonly mode = signal<ViewMode>('list');
  protected readonly editingId = signal<string | null>(null);

  protected readonly displayNameField = field<string>('', (v) => requiredTextError(v, DISPLAY_NAME_MAX_LENGTH));
  protected readonly emailField = field<string>('', emailFieldError);
  protected readonly specialtyField = field<string>('', (v) => optionalTextError(v, SPECIALTY_MAX_LENGTH));
  protected readonly bioField = field<string>('', (v) => optionalTextError(v, BIO_MAX_LENGTH));
  protected readonly photoUrl = signal('');
  protected readonly displayOrder = signal<number | null>(null);
  protected readonly phoneE164 = signal('');
  protected readonly phoneOk = signal(true);
  protected readonly scheduleBlocks = signal<ScheduleBlockDraft[]>([]);

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

  protected readonly formValid = computed(
    () =>
      allValid(this.displayNameField, this.specialtyField, this.bioField) &&
      this.emailField.error() === null &&
      this.phoneOk(),
  );

  constructor() {
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

  protected openCreate(): void {
    this.resetForm();
    this.formError.set(null);
    this.mode.set('create');
  }

  protected async openEdit(doctorId: string): Promise<void> {
    this.confirmingDeactivateFor.set(null);
    this.formError.set(null);
    try {
      const detail = await firstValueFrom(this.adminDoctorsService.getById(doctorId));
      this.resetForm();
      this.displayNameField.reset(detail.displayName ?? '');
      this.emailField.reset(detail.email ?? '');
      this.phoneE164.set(detail.phone ?? '');
      this.specialtyField.reset(detail.specialty ?? '');
      this.bioField.reset(detail.bio ?? '');
      this.photoUrl.set(detail.photoUrl ?? '');
      this.displayOrder.set(detail.displayOrder);
      this.scheduleBlocks.set(detail.scheduleBlocks.map((b) => ({ ...b })));
      this.editingId.set(doctorId);
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
    this.displayNameField.reset('');
    this.emailField.reset('');
    this.phoneE164.set('');
    this.phoneOk.set(true);
    this.specialtyField.reset('');
    this.bioField.reset('');
    this.photoUrl.set('');
    this.displayOrder.set(null);
    this.scheduleBlocks.set([]);
    this.formError.set(null);
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
    touchAll(this.displayNameField, this.emailField, this.specialtyField, this.bioField);
    if (!this.formValid()) {
      return;
    }

    this.submitting.set(true);
    this.formError.set(null);
    try {
      const shared = {
        displayName: normalizeText(this.displayNameField.value()),
        email: normalizeEmail(this.emailField.value()),
        phone: isBareCallingCode(this.phoneE164()) ? undefined : this.phoneE164(),
        specialty: this.specialtyField.value().trim() || undefined,
        bio: this.bioField.value().trim() || undefined,
        photoUrl: this.photoUrl().trim() || undefined,
        displayOrder: this.displayOrder() ?? undefined,
        scheduleBlocks: this.scheduleBlocks().map((b) => ({ weekday: b.weekday, start: b.start, end: b.end })),
      };

      if (this.mode() === 'create') {
        const request: CreateDoctorRequest = shared;
        const result = await firstValueFrom(this.adminDoctorsService.create(request));
        this.closeForm();
        await this.loadDoctors();
        this.showSuccess(
          result.inviteSent
            ? 'Doctor creado. Se envió el email de invitación.'
            : 'Doctor creado, pero no se pudo enviar el email de invitación. Reintentá desde el panel de invitaciones.',
        );
      } else {
        const id = this.editingId();
        if (!id) {
          return;
        }
        const request: UpdateDoctorRequest = shared;
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
