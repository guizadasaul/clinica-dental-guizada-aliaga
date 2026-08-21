// Espejo de api/src/appointments/infrastructure/http/dto/guest-contact.dto.ts
// (el @Matches(EMAIL_RE) que ahí se suma al @IsEmail()) — cambiar los dos juntos.
// Función pura, sin Angular.

export const EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/;

const EMAIL_MAX_LENGTH = 255;

/** Recorta y pasa a minúsculas — se aplica antes de validar y antes de guardar. */
export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * El correo es opcional en la reserva de cita (decisión de CLI-22): esta función
 * solo dice si el FORMATO es válido. Si el campo está vacío, quien la llama decide
 * si eso es aceptable (acá `isValidEmail('')` da `false`, a propósito).
 */
export function isValidEmail(value: string): boolean {
  const normalized = normalizeEmail(value);
  return normalized.length > 0 && normalized.length <= EMAIL_MAX_LENGTH && EMAIL_RE.test(normalized);
}
