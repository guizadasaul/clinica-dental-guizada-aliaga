// Espejo de api/src/shared/validators/phone.validator.ts (E164_RE) — cambiar los dos
// juntos. La validación de "¿es un número real?" no usa una tabla a mano: se apoya en
// libphonenumber-js (isValidPhoneNumber / validatePhoneNumberLength), igual que el backend.
import {
  getCountryCallingCode,
  isValidPhoneNumber,
  validatePhoneNumberLength,
  type CountryCode,
  type ValidatePhoneNumberLengthResult,
} from 'libphonenumber-js';

/** Salida final siempre en E.164, ej. "+59171234567" — cabe en VARCHAR(20). */
export const E164_RE = /^\+[1-9]\d{6,14}$/;

/** Países mostrados primero en el desplegable de `app-phone-input`: mercado local y
 * países vecinos/de uso frecuente. El resto sale de `getCountries()`. */
export const PRIORITY_COUNTRIES: readonly CountryCode[] = [
  'BO',
  'AR',
  'BR',
  'CL',
  'PE',
  'PY',
  'UY',
  'CO',
  'EC',
  'MX',
  'ES',
  'US',
];

/** Bolivia por defecto. */
export const DEFAULT_COUNTRY: CountryCode = 'BO';

/** `+{indicativo}{número nacional}`, sin espacios ni separadores. */
export function toE164(callingCode: string, national: string): string {
  return `+${callingCode}${national}`;
}

export interface NationalPhoneValidation {
  readonly valid: boolean;
  /** Solo se llena cuando `valid` es `false` y el motivo es de largo (`TOO_SHORT` / `TOO_LONG` / …). */
  readonly lengthIssue: ValidatePhoneNumberLengthResult | undefined;
}

/** Valida un número nacional (sin indicativo de país) contra `country`. */
export function validateNationalPhone(national: string, country: CountryCode): NationalPhoneValidation {
  if (!national) {
    return { valid: false, lengthIssue: undefined };
  }
  const valid = isValidPhoneNumber(national, country);
  return {
    valid,
    lengthIssue: valid ? undefined : validatePhoneNumberLength(national, country),
  };
}

/** Indicativo de marcación del país, ej. "591" para BO. */
export function callingCodeFor(country: CountryCode): string {
  return getCountryCallingCode(country);
}
