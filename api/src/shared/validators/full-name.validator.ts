import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
} from 'class-validator';

// Espejo de frontend/src/app/shared/validation/full-name.validator.ts —
// cambiar los dos juntos. Una sola "palabra" para las dos reglas: una letra
// seguida de ≥1 de [letra, marca diacrítica, apóstrofo (recto o tipográfico),
// guion] — o sea, ≥2 caracteres, siempre empezando con letra. Rechaza dígitos,
// `@ < > ; --` (como secuencia de guiones sueltos no pegados a una letra) y
// emojis porque ninguno de esos es \p{L}/\p{M}. Las dos reglas solo difieren
// en el cuantificador del grupo repetido.
const WORD = String.raw`\p{L}[\p{L}\p{M}'’-]+`;

/** Nombre y apellido — ≥2 palabras. Reserva de cita (GuestContactDto.fullName). */
export const FULL_NAME_RE = new RegExp(`^${WORD}(?:\\s+${WORD})+$`, 'u');

/** Una palabra alcanza — formulario de comentarios (CreateTestimonialDto.name). */
export const PERSON_NAME_RE = new RegExp(`^${WORD}(?:\\s+${WORD})*$`, 'u');

const SINGLE_WORD_RE = new RegExp(`^${WORD}$`, 'u');

// Partículas que en español van en minúscula cuando NO encabezan el nombre
// ("Juan de la Cruz", "María del Carmen"), pero se capitalizan si lo abren
// ("De la Cruz Pérez"). Sin esto, un title-case ingenuo devolvería
// "Juan De La Cruz", que está mal escrito.
const LOWERCASE_PARTICLES = new Set([
  'de',
  'del',
  'la',
  'las',
  'los',
  'da',
  'das',
  'do',
  'dos',
  'van',
  'von',
  'der',
  'di',
  'du',
]);

// Capitaliza la primera letra de la palabra y también la que sigue a un guion
// o a un apóstrofo: "perez-gomez" → "Perez-Gomez", "o'connor" → "O'Connor".
function capitalizeWord(word: string): string {
  return word.replace(
    /(^|[-'\u2019])(\p{L})/gu,
    (_match, separator: string, letter: string) =>
      separator + letter.toUpperCase(),
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

function reasonMessage(value: unknown, requireTwoWords: boolean): string {
  if (typeof value !== 'string') {
    return 'Ingresá tu nombre completo.';
  }
  const normalized = normalizeFullName(value);
  if (normalized === '') {
    return 'Ingresá tu nombre completo.';
  }
  if (requireTwoWords) {
    const words = normalized.split(' ');
    const allWordsValid = words.every((word) => SINGLE_WORD_RE.test(word));
    if (allWordsValid && words.length < 2) {
      return 'Necesitamos nombre y apellido (ej: Juan Claros).';
    }
  }
  return 'El nombre solo puede tener letras.';
}

/** Nombre y apellido (≥2 palabras), contra `FULL_NAME_RE`. Ver reserva de cita. */
export function IsFullName(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string): void {
    registerDecorator({
      name: 'isFullName',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown): boolean {
          if (typeof value !== 'string') return false;
          return FULL_NAME_RE.test(normalizeFullName(value));
        },
        defaultMessage(args: ValidationArguments): string {
          return reasonMessage(args.value, true);
        },
      },
    });
  };
}

/** Una palabra alcanza (≥1 palabra), contra `PERSON_NAME_RE`. Ver formulario de comentarios. */
export function IsPersonName(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string): void {
    registerDecorator({
      name: 'isPersonName',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown): boolean {
          if (typeof value !== 'string') return false;
          return PERSON_NAME_RE.test(normalizeFullName(value));
        },
        defaultMessage(args: ValidationArguments): string {
          return reasonMessage(args.value, false);
        },
      },
    });
  };
}
