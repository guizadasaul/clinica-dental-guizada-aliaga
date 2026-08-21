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

/** trim() + colapsar espacios repetidos a uno solo. Usar antes de validar y de guardar. */
export function normalizeFullName(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
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
