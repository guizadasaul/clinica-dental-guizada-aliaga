// Espejo de api/src/shared/validators/full-name.validator.ts — cambiar los dos juntos.
// Funciones puras, sin Angular: se pueden testear sin TestBed y se reusan tal cual
// desde cualquier componente de formulario.

/** Una "palabra" de nombre: arranca con una letra y sigue con ≥1 letra/marca
 * diacrítica/apóstrofo/guion. O sea, cada palabra tiene mínimo 2 caracteres y
 * nunca son dígitos, `@`, `<`, `>`, `;`, `/`, `\` ni emojis. */
const WORD = String.raw`\p{L}[\p{L}\p{M}'’-]+`;

/** Nombre y apellido — reserva de cita. Exige ≥2 palabras. */
export const FULL_NAME_RE = new RegExp(`^${WORD}(?:\\s+${WORD})+$`, 'u');
/** Con una sola palabra alcanza — formulario de comentarios (ver decisión en CLI-36 §4.2). */
export const PERSON_NAME_RE = new RegExp(`^${WORD}(?:\\s+${WORD})*$`, 'u');

// El mínimo de largo (5 para FULL_NAME_RE, 2 para PERSON_NAME_RE) ya lo impone
// la regex — cada palabra mide ≥2 y FULL_NAME_RE exige dos separadas por espacio.
// Solo hace falta chequear el máximo a mano.
const FULL_NAME_MAX_LENGTH = 200;
const PERSON_NAME_MAX_LENGTH = 100;

export type NameValidationError = 'empty' | 'single-word' | 'invalid-chars' | 'too-long' | null;

/** Colapsa espacios repetidos y recorta — se aplica antes de validar y antes de guardar. */
export function normalizeFullName(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

/** Regla estricta: nombre + apellido (≥2 palabras). Usada en la reserva de cita. */
export function validateFullName(value: string): NameValidationError {
  const normalized = normalizeFullName(value);
  if (!normalized) return 'empty';
  if (normalized.length > FULL_NAME_MAX_LENGTH) return 'too-long';
  if (FULL_NAME_RE.test(normalized)) return null;
  if (PERSON_NAME_RE.test(normalized)) return 'single-word';
  return 'invalid-chars';
}

/** Regla suave: con una sola palabra alcanza. Usada en el formulario de comentarios. */
export function validatePersonName(value: string): NameValidationError {
  const normalized = normalizeFullName(value);
  if (!normalized) return 'empty';
  if (normalized.length > PERSON_NAME_MAX_LENGTH) return 'too-long';
  if (PERSON_NAME_RE.test(normalized)) return null;
  return 'invalid-chars';
}
