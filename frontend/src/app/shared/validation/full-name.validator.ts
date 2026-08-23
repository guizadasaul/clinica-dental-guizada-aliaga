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
// Exportado: CLI-39 lo necesita para alinear el `maxlength` del HTML (y sus
// propios mensajes de error) con el mismo límite que ya aplica `validatePersonName`.
export const PERSON_NAME_MAX_LENGTH = 100;

export type NameValidationError = 'empty' | 'single-word' | 'invalid-chars' | 'too-long' | null;

// Partículas que en español van en minúscula cuando NO encabezan el nombre
// ("Juan de la Cruz", "María del Carmen"), pero se capitalizan si lo abren
// ("De la Cruz Pérez"). Sin esto, un title-case ingenuo devolvería
// "Juan De La Cruz", que está mal escrito.
const LOWERCASE_PARTICLES = new Set([
  'de', 'del', 'la', 'las', 'los', 'da', 'das', 'do', 'dos',
  'van', 'von', 'der', 'di', 'du',
]);

// Capitaliza la primera letra de la palabra y también la que sigue a un guion
// o a un apóstrofo: "perez-gomez" → "Perez-Gomez", "o'connor" → "O'Connor".
function capitalizeWord(word: string): string {
  return word.replace(
    /(^|[-'\u2019])(\p{L})/gu,
    (_match, separator: string, letter: string) => separator + letter.toUpperCase(),
  );
}

/**
 * Normaliza un nombre para que se guarde siempre igual, sin importar cómo lo
 * haya tipeado el visitante: recorta, colapsa espacios repetidos y aplica
 * mayúscula inicial por palabra. "  adrian   MeRcAdO " → "Adrian Mercado".
 *
 * Se aplica antes de validar Y antes de guardar, en las dos puntas. Usa
 * toLowerCase()/toUpperCase() sin locale a propósito: la variante con locale
 * solo cambia para turco/azerí y podría dar resultados distintos en Node y en
 * el browser, y acá lo que importa es que las dos puntas coincidan exacto.
 */
export function normalizeFullName(value: string): string {
  const collapsed = value.trim().replace(/\s+/g, ' ');
  if (collapsed === '') return '';

  return collapsed
    .toLowerCase()
    .split(' ')
    .map((word, index) =>
      index > 0 && LOWERCASE_PARTICLES.has(word) ? word : capitalizeWord(word),
    )
    .join(' ');
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
