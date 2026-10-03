import {
  Component,
  ChangeDetectionStrategy,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { DoctorProfileService } from '../../services/doctor-profile.service';
import type { DoctorProfile } from '../../models/doctor-profile.model';
import { PhoneInputComponent } from '../../../../shared/ui/phone-input/phone-input';
import { ColorPickerComponent } from '../../../../shared/ui/color-picker/color-picker';
import { ScheduleEditorComponent } from '../../../../shared/ui/schedule-editor/schedule-editor';
import { allValid, field, touchAll } from '../../../../shared/validation/field';
import {
  PERSON_NAME_MAX_LENGTH,
  normalizeFullName,
  validatePersonName,
} from '../../../../shared/validation/full-name.validator';
import { normalizeText, optionalTextError, requiredTextError } from '../../../../shared/validation/text.validator';
import { scheduleError, type ScheduleBlock } from '../../../../shared/utils/schedule-blocks.util';

const DISPLAY_NAME_MAX_LENGTH = 200;
const SPECIALTY_MAX_LENGTH = 150;
const BIO_MAX_LENGTH = 2000;
const MIN_NAME_LENGTH = 3;

/** "" (todavía no tocó el campo) o "+591" (solo el indicativo): no hay un número cargado. */
function isBareCallingCode(e164: string): boolean {
  return e164 === '' || /^\+\d{1,3}$/.test(e164);
}

function personNameError(value: string, label: string, required: boolean): string | null {
  if (!value.trim()) {
    return required ? `${label} es obligatorio.` : null;
  }
  const err = validatePersonName(value);
  if (err === 'invalid-chars') return `${label} solo puede tener letras.`;
  if (err === 'too-long') return `${label} no puede superar los ${PERSON_NAME_MAX_LENGTH} caracteres.`;
  if (normalizeFullName(value).length < MIN_NAME_LENGTH) {
    return `${label} tiene que tener al menos ${MIN_NAME_LENGTH} caracteres.`;
  }
  return null;
}

/** `message` del cuerpo de un HttpErrorResponse (string o string[] de class-validator), o null. */
function backendMessage(err: unknown): string | null {
  const message = (err as { error?: { message?: unknown } } | null)?.error?.message;
  if (typeof message === 'string' && message.trim()) return message;
  if (Array.isArray(message)) {
    const lines = message.filter((m): m is string => typeof m === 'string' && m.trim() !== '');
    return lines.length > 0 ? lines.join(' ') : null;
  }
  return null;
}

/**
 * Configuración del propio doctor (CLI-191): nombre, teléfono, especialidad,
 * descripción, color de la agenda y horario semanal. El correo no se edita
 * (es su acceso) y tampoco si es reservable ni el orden: eso es del administrador.
 */
@Component({
  selector: 'app-doctor-settings',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PhoneInputComponent, ColorPickerComponent, ScheduleEditorComponent],
  templateUrl: './doctor-settings.html',
  styleUrl: './doctor-settings.scss',
})
export class DoctorSettingsComponent implements OnInit {
  private readonly profileService = inject(DoctorProfileService);

  protected readonly loading = signal(true);
  protected readonly loadError = signal(false);
  protected readonly saving = signal(false);
  protected readonly saveError = signal<string | null>(null);
  protected readonly saved = signal(false);
  protected readonly email = signal<string | null>(null);

  protected readonly displayName = field<string>('', (v: string) =>
    requiredTextError(v, DISPLAY_NAME_MAX_LENGTH, { minLength: MIN_NAME_LENGTH }),
  );
  protected readonly firstName = field<string>('', (v: string) => personNameError(v, 'El nombre', false));
  protected readonly lastNamePaternal = field<string>('', (v: string) => personNameError(v, 'El apellido paterno', false));
  protected readonly lastNameMaternal = field<string>('', (v: string) => personNameError(v, 'El apellido materno', false));
  protected readonly specialty = field<string>('', (v: string) => optionalTextError(v, SPECIALTY_MAX_LENGTH, MIN_NAME_LENGTH));
  protected readonly bio = field<string>('', (v: string) => optionalTextError(v, BIO_MAX_LENGTH, MIN_NAME_LENGTH));

  protected readonly phoneE164 = signal('');
  protected readonly phoneOk = signal(true);
  protected readonly color = signal('#2563eb');
  protected readonly schedule = signal<ScheduleBlock[]>([]);
  protected readonly scheduleProblem = computed(() => scheduleError(this.schedule()));

  private readonly fields = [
    this.displayName,
    this.firstName,
    this.lastNamePaternal,
    this.lastNameMaternal,
    this.specialty,
    this.bio,
  ];

  ngOnInit(): void {
    void this.load();
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    this.loadError.set(false);
    try {
      this.fill(await firstValueFrom(this.profileService.getMine()));
    } catch {
      this.loadError.set(true);
    } finally {
      this.loading.set(false);
    }
  }

  private fill(profile: DoctorProfile): void {
    this.email.set(profile.email);
    this.displayName.reset(profile.displayName ?? '');
    this.firstName.reset(profile.firstName ?? '');
    this.lastNamePaternal.reset(profile.lastNamePaternal ?? '');
    this.lastNameMaternal.reset(profile.lastNameMaternal ?? '');
    this.specialty.reset(profile.specialty ?? '');
    this.bio.reset(profile.bio ?? '');
    this.phoneE164.set(profile.phone ?? '');
    this.phoneOk.set(true);
    this.color.set(profile.color);
    this.schedule.set(profile.scheduleBlocks.map((b) => ({ ...b })));
  }

  protected retry(): void {
    void this.load();
  }

  protected onPhoneChanged(event: { e164: string; valid: boolean }): void {
    this.phoneE164.set(event.e164);
    this.phoneOk.set(event.valid || isBareCallingCode(event.e164));
    this.saved.set(false);
  }

  /** Al salir de un campo corto lo deja como se va a guardar: mayúscula inicial y un solo espacio. */
  protected tidy(target: ReturnType<typeof field<string>>): void {
    if (target.value().trim()) {
      target.set(normalizeFullName(target.value()));
    }
  }

  protected async save(): Promise<void> {
    touchAll(...this.fields);
    this.saved.set(false);
    if (!allValid(...this.fields) || !this.phoneOk() || this.scheduleProblem()) {
      this.saveError.set('Revisa los campos marcados en rojo.');
      return;
    }
    this.saving.set(true);
    this.saveError.set(null);
    try {
      const phone = isBareCallingCode(this.phoneE164()) ? undefined : this.phoneE164();
      const updated = await firstValueFrom(
        this.profileService.updateMine({
          displayName: normalizeFullName(this.displayName.value()),
          ...(this.firstName.value().trim() && {
            firstName: normalizeFullName(this.firstName.value()),
          }),
          ...(this.lastNamePaternal.value().trim() && {
            lastNamePaternal: normalizeFullName(this.lastNamePaternal.value()),
          }),
          ...(this.lastNameMaternal.value().trim() && {
            lastNameMaternal: normalizeFullName(this.lastNameMaternal.value()),
          }),
          ...(phone && { phone }),
          ...(this.specialty.value().trim() && { specialty: normalizeFullName(this.specialty.value()) }),
          ...(this.bio.value().trim() && { bio: normalizeText(this.bio.value()) }),
          color: this.color(),
          scheduleBlocks: this.schedule().map((b) => ({ weekday: b.weekday, start: b.start, end: b.end })),
        }),
      );
      this.fill(updated);
      this.saved.set(true);
    } catch (err) {
      this.saveError.set(backendMessage(err) ?? 'No se pudieron guardar los cambios. Intenta de nuevo.');
    } finally {
      this.saving.set(false);
    }
  }
}
