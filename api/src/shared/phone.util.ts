import { parsePhoneNumberFromString } from 'libphonenumber-js';

/**
 * Últimos `count` dígitos de un teléfono, para mostrar una pista ("terminado
 * en 665") sin exponer el número completo.
 */
export function phoneLastDigits(phone: string, count = 3): string {
  return phone.replace(/\D/g, '').slice(-count);
}

/**
 * E.164 de un teléfono guardado de cualquier forma ("+59171234567",
 * "59171234567", "71234567"); los números sin código de país se toman como
 * bolivianos. null si no es un número válido.
 */
export function toE164(phone: string): string | null {
  const trimmed = phone.trim();
  const digits = trimmed.replace(/\D/g, '');
  const candidate =
    trimmed.startsWith('+') || digits.length > 8 ? `+${digits}` : digits;
  const parsed = parsePhoneNumberFromString(candidate, 'BO');
  return parsed?.isValid() ? parsed.number : null;
}

/** Normaliza un teléfono boliviano (con o sin prefijo 591) a E.164, ej. "+59171234567". */
export function toE164Bolivia(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  const normalized = digits.startsWith('591') ? digits : `591${digits}`;
  return `+${normalized}`;
}
