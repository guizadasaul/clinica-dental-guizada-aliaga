import {
  Component,
  ChangeDetectionStrategy,
  input,
  output,
  signal,
  effect,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PhoneInputComponent } from '../../../../../../shared/ui/phone-input/phone-input';
import { field, allValid, touchAll } from '../../../../../../shared/validation/field';
import {
  normalizeFullName,
  validatePersonName,
  PERSON_NAME_RE,
  PERSON_NAME_MAX_LENGTH,
} from '../../../../../../shared/validation/full-name.validator';
import { normalizeDni, isValidDni } from '../../../../../../shared/validation/dni.validator';
import { normalizeText, optionalTextError } from '../../../../../../shared/validation/text.validator';
import { isNotFutureDate, isAgeWithin, isNotBefore } from '../../../../../../shared/validation/date.validator';
import type { Patient } from '../../../../models/patient.model';
import type { CreatePatientRequest } from '../../../../models/patient.request';

// MaxLength(200) del DTO — más laxo que PERSON_NAME_MAX_LENGTH (100), así que
// para este campo puntual no reusamos el tope interno de validatePersonName.
const EMERGENCY_CONTACT_NAME_MAX_LENGTH = 200;

// Mínimo general de texto libre del wizard — una sola letra o un solo
// número no alcanzan como respuesta real en ningún campo.
const MIN_TEXT_LENGTH = 3;

function requiredPersonNameError(value: string, label: string): string | null {
  const err = validatePersonName(value);
  if (err === 'empty') return `${label} es obligatorio.`;
  if (err === 'invalid-chars') return `${label} solo puede tener letras.`;
  if (err === 'too-long') return `${label} no puede superar los ${PERSON_NAME_MAX_LENGTH} caracteres.`;
  if (normalizeFullName(value).length < MIN_TEXT_LENGTH) {
    return `${label} tiene que tener al menos ${MIN_TEXT_LENGTH} caracteres.`;
  }
  return null;
}

function optionalPersonNameError(value: string, label: string): string | null {
  if (!value.trim()) return null;
  const err = validatePersonName(value);
  if (err === 'invalid-chars') return `${label} solo puede tener letras.`;
  if (err === 'too-long') return `${label} no puede superar los ${PERSON_NAME_MAX_LENGTH} caracteres.`;
  if (normalizeFullName(value).length < MIN_TEXT_LENGTH) {
    return `${label} tiene que tener al menos ${MIN_TEXT_LENGTH} caracteres.`;
  }
  return null;
}

// Contacto de emergencia — nombre obligatorio (antes era opcional).
function emergencyContactNameError(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return 'El nombre del contacto de emergencia es obligatorio.';
  const normalized = normalizeFullName(trimmed);
  if (!PERSON_NAME_RE.test(normalized)) return 'El nombre solo puede tener letras.';
  if (normalized.length < MIN_TEXT_LENGTH) {
    return `El nombre tiene que tener al menos ${MIN_TEXT_LENGTH} caracteres.`;
  }
  if (normalized.length > EMERGENCY_CONTACT_NAME_MAX_LENGTH) {
    return `El nombre no puede superar los ${EMERGENCY_CONTACT_NAME_MAX_LENGTH} caracteres.`;
  }
  return null;
}

function birthDateError(value: string): string | null {
  if (!value) return 'La fecha de nacimiento es obligatoria.';
  if (!isNotFutureDate(value)) return 'La fecha no puede ser futura.';
  if (!isAgeWithin(value, 0, 120)) return 'La edad tiene que estar entre 0 y 120 años.';
  return null;
}

function dniFieldError(value: string): string | null {
  if (!value.trim()) return 'El DNI es obligatorio.';
  if (!isValidDni(value)) return 'El DNI solo puede tener letras y números (5 a 15 caracteres).';
  return null;
}

// Texto libre OBLIGATORIO del wizard (lugar de nacimiento, ocupación,
// dirección, parentesco del contacto de emergencia) — mismo trío de reglas
// que optionalTextError, pero exige presencia y respeta MIN_TEXT_LENGTH.
function requiredTextFieldError(value: string, maxLength: number, label: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return `${label} es obligatorio.`;
  return optionalTextError(value, maxLength, MIN_TEXT_LENGTH);
}

/** "" (todavía no cambió) o "+591" (nada más que el indicativo, sin dígitos
 * nacionales) = el doctor no tipeó ningún número — el campo es opcional. */
function isBareCallingCode(e164: string): boolean {
  return e164 === '' || /^\+\d{1,3}$/.test(e164);
}

@Component({
  selector: 'app-step-patient-data',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, PhoneInputComponent],
  templateUrl: './step-patient-data.html',
  styleUrl: './step-patient-data.scss',
})
export class StepPatientDataComponent {
  readonly loading = input(false);
  /** Paciente existente cuando el wizard se abre sobre una ficha ya creada
   * ("Registrar diagnóstico" en step 1) — precarga los campos en vez de
   * obligar a retipear nombre/apellido/fecha de nacimiento. */
  readonly existingPatient = input<Patient | null>(null);
  readonly submitStep = output<Omit<CreatePatientRequest, 'userId'>>();

  protected readonly emergencyContactNameMaxLength = EMERGENCY_CONTACT_NAME_MAX_LENGTH;

  protected readonly firstName = field<string>('', (v: string) => requiredPersonNameError(v, 'El nombre'));
  protected readonly lastNamePaternal = field<string>('', (v: string) =>
    requiredPersonNameError(v, 'El apellido paterno'),
  );
  protected readonly lastNameMaternal = field<string>('', (v: string) =>
    optionalPersonNameError(v, 'El apellido materno'),
  );
  protected readonly birthDate = field<string>('', birthDateError);
  protected readonly birthPlace = field<string>('', (v: string) =>
    requiredTextFieldError(v, 150, 'El lugar de nacimiento'),
  );
  protected readonly sex = field<string>('', (v: string) => (v ? null : 'El sexo es obligatorio.'));
  protected readonly occupation = field<string>('', (v: string) => requiredTextFieldError(v, 150, 'La ocupación'));
  protected readonly dni = field<string>('', dniFieldError);
  protected readonly address = field<string>('', (v: string) => requiredTextFieldError(v, 300, 'La dirección'));
  protected readonly emergencyContactName = field<string>('', emergencyContactNameError);
  protected readonly emergencyContactRelationship = field<string>('', (v: string) =>
    requiredTextFieldError(v, 100, 'El parentesco'),
  );
  protected readonly consultationReason = field<string>('', (v: string) => optionalTextError(v, 1000, MIN_TEXT_LENGTH));
  protected readonly lastDentistVisit = field<string>('', (v: string) => {
    if (!v) return null;
    if (!isNotFutureDate(v)) return 'La fecha no puede ser futura.';
    if (!isNotBefore(v, this.birthDate.value())) return 'No puede ser anterior a la fecha de nacimiento.';
    return null;
  });
  protected readonly lastVisitTreatment = field<string>('', (v: string) => optionalTextError(v, 500, MIN_TEXT_LENGTH));
  protected readonly familyHistory = field<string>('', (v: string) => optionalTextError(v, 1000, MIN_TEXT_LENGTH));

  // app-phone-input maneja su propio error visual (touched interno) — acá solo
  // necesitamos saber si lo que emitió bloquea el envío. El teléfono del
  // PACIENTE sigue opcional (vacío está bien, a medio tipear no); el del
  // CONTACTO DE EMERGENCIA es obligatorio (vacío también bloquea).
  protected readonly phoneE164 = signal('');
  protected readonly phoneOk = signal(true);
  protected readonly emergencyContactPhoneE164 = signal('');
  protected readonly emergencyContactPhoneOk = signal(false);

  protected readonly formError = signal<string | null>(null);
  // <app-phone-input> no expone markTouched() — este campo no puede sumarse
  // al patrón field()/touchAll(), así que usamos un signal aparte para saber
  // si ya se intentó enviar y recién ahí mostrar su error obligatorio.
  protected readonly submitted = signal(false);

  private readonly fields = [
    this.firstName,
    this.lastNamePaternal,
    this.lastNameMaternal,
    this.birthDate,
    this.birthPlace,
    this.sex,
    this.occupation,
    this.dni,
    this.address,
    this.emergencyContactName,
    this.emergencyContactRelationship,
    this.consultationReason,
    this.lastDentistVisit,
    this.lastVisitTreatment,
    this.familyHistory,
  ];

  private patientLoaded = false;

  constructor() {
    effect(
      () => {
        const patient = this.existingPatient();
        if (this.patientLoaded || !patient) {
          return;
        }
        this.patientLoaded = true;
        this.firstName.reset(patient.firstName);
        this.lastNamePaternal.reset(patient.lastNamePaternal);
        this.lastNameMaternal.reset(patient.lastNameMaternal ?? '');
        this.birthDate.reset(patient.birthDate ? patient.birthDate.slice(0, 10) : '');
        this.birthPlace.reset(patient.birthPlace ?? '');
        this.sex.reset(patient.sex ?? '');
        this.occupation.reset(patient.occupation ?? '');
        this.dni.reset(patient.dni ?? '');
        this.address.reset(patient.address ?? '');
        this.emergencyContactName.reset(patient.emergencyContactName ?? '');
        this.emergencyContactRelationship.reset(patient.emergencyContactRelationship ?? '');
        this.consultationReason.reset(patient.consultationReason ?? '');
        this.lastDentistVisit.reset(patient.lastDentistVisit ? patient.lastDentistVisit.slice(0, 10) : '');
        this.lastVisitTreatment.reset(patient.lastVisitTreatment ?? '');
        this.familyHistory.reset(patient.familyHistory ?? '');
        this.phoneE164.set(patient.phone ?? '');
        this.emergencyContactPhoneE164.set(patient.emergencyContactPhone ?? '');
        // <app-phone-input> no re-emite `changed` cuando su `[value]` cambia
        // por prefill externo (solo al tipear) — sin esto, un paciente con
        // teléfono de emergencia ya guardado (y válido, porque el backend lo
        // validó al crearlo) quedaría bloqueado en el submit hasta que el
        // doctor re-toque el campo sin necesidad.
        this.emergencyContactPhoneOk.set(!!patient.emergencyContactPhone);
      },
      { allowSignalWrites: true },
    );
  }

  protected onPhoneChanged(event: { e164: string; valid: boolean }): void {
    this.phoneE164.set(event.e164);
    this.phoneOk.set(event.valid || isBareCallingCode(event.e164));
  }

  // A diferencia de phoneOk, acá isBareCallingCode NO cuenta como válido —
  // el teléfono del contacto de emergencia es obligatorio, así que vacío
  // bloquea el envío en vez de tratarse como "no vino nada, es opcional".
  protected onEmergencyContactPhoneChanged(event: { e164: string; valid: boolean }): void {
    this.emergencyContactPhoneE164.set(event.e164);
    this.emergencyContactPhoneOk.set(event.valid);
  }

  protected onSubmit(): void {
    touchAll(...this.fields);
    this.submitted.set(true);
    if (!allValid(...this.fields) || !this.phoneOk() || !this.emergencyContactPhoneOk()) {
      this.formError.set('Revisá los campos marcados en rojo.');
      return;
    }
    this.formError.set(null);
    this.submitStep.emit({
      firstName: normalizeFullName(this.firstName.value()),
      lastNamePaternal: normalizeFullName(this.lastNamePaternal.value()),
      lastNameMaternal: this.lastNameMaternal.value().trim()
        ? normalizeFullName(this.lastNameMaternal.value())
        : undefined,
      birthDate: this.birthDate.value(),
      birthPlace: normalizeText(this.birthPlace.value()),
      sex: this.sex.value(),
      occupation: normalizeText(this.occupation.value()),
      address: normalizeText(this.address.value()),
      phone: isBareCallingCode(this.phoneE164()) ? undefined : this.phoneE164(),
      dni: normalizeDni(this.dni.value()),
      emergencyContactName: normalizeFullName(this.emergencyContactName.value()),
      emergencyContactPhone: this.emergencyContactPhoneE164(),
      emergencyContactRelationship: normalizeText(this.emergencyContactRelationship.value()),
      consultationReason: normalizeText(this.consultationReason.value()) || undefined,
      lastDentistVisit: this.lastDentistVisit.value() || undefined,
      lastVisitTreatment: normalizeText(this.lastVisitTreatment.value()) || undefined,
      familyHistory: normalizeText(this.familyHistory.value()) || undefined,
    });
  }
}
