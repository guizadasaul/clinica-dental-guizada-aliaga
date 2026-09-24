import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
} from 'class-validator';

// Espejo de frontend/src/app/shared/validation/text-safety.validator.ts —
// cambiar los dos juntos (regex carácter por carácter iguales).

/** Cualquier tag HTML: `<algo>`, `</algo>`, `<algo attr="x">`. */
const HTML_RE = /<[^<>]*>/;

// Lista blanca de TLDs a propósito, no `\.[a-z]{2,}`: un texto legítimo como
// "excelente.Muy recomendable" (punto pegado a la siguiente palabra, sin
// espacio) NO tiene que dispararlo — "Muy" no es un TLD real. Cubre el link
// explícito (http(s)://... o www....) y el dominio pelado (spam.com).
const URL_TLDS = 'com|net|org|io|co|xyz|ru|info|biz|shop|online|site|link';
const URL_RE = new RegExp(
  String.raw`(?:https?:\/\/|www\.)\S+|\b[a-z0-9-]+\.(?:${URL_TLDS})\b`,
  'iu',
);

/** Ningún tag HTML en el texto. */
export function NoHtml(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string): void {
    registerDecorator({
      name: 'noHtml',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown): boolean {
          if (typeof value !== 'string') return true; // lo rechaza @IsString()
          return !HTML_RE.test(value);
        },
        defaultMessage(): string {
          return 'No se permite HTML en el texto.';
        },
      },
    });
  };
}

/** Ningún link (http(s)://, www. o dominio con TLD conocido) en el texto. */
export function NoUrls(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string): void {
    registerDecorator({
      name: 'noUrls',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown): boolean {
          if (typeof value !== 'string') return true;
          return !URL_RE.test(value);
        },
        defaultMessage(): string {
          return 'No se permiten links en el texto.';
        },
      },
    });
  };
}

/** Ningún carácter repetido más de `max` veces seguidas (ej. "aaaaaaaaaaaa"). */
export function NoCharSpam(max: number, validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string): void {
    registerDecorator({
      name: 'noCharSpam',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      constraints: [max],
      validator: {
        validate(value: unknown, args: ValidationArguments): boolean {
          if (typeof value !== 'string') return true;
          const [maxRepeat] = args.constraints as [number];
          const spamRe = new RegExp(String.raw`(.)\1{${maxRepeat},}`, 'u');
          return !spamRe.test(value);
        },
        defaultMessage(): string {
          return 'El texto tiene demasiados caracteres repetidos seguidos.';
        },
      },
    });
  };
}
