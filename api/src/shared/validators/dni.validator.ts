import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
} from 'class-validator';

// Espejo de frontend/src/app/shared/validation/dni.validator.ts — cambiar
// los dos juntos. DNI opcional: 5 a 15 caracteres alfanuméricos en
// mayúscula, sin puntos/espacios/guiones (se normaliza antes de validar).
// dni es @unique en la base — "12.345.678" y "12345678" tienen que
// terminar siendo el mismo valor guardado.
export const DNI_RE = /^[A-Z0-9]{5,15}$/;

/**
 * Normaliza un DNI para que se guarde siempre igual sin importar cómo lo
 * haya tipeado el doctor: recorta, pasa a mayúsculas y saca puntos, espacios
 * y guiones. Se aplica antes de validar Y antes de guardar, en las dos
 * puntas — igual que normalizeFullName.
 */
export function normalizeDni(value: string): string {
  return value
    .trim()
    .toUpperCase()
    .replace(/[\s.-]/g, '');
}

/** DNI normalizado contra `DNI_RE` — 5 a 15 alfanuméricos en mayúscula. */
export function IsDni(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string): void {
    registerDecorator({
      name: 'isDni',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown): boolean {
          if (typeof value !== 'string') return false;
          return DNI_RE.test(value);
        },
        defaultMessage(): string {
          return 'El DNI solo puede tener letras y números (5 a 15 caracteres).';
        },
      },
    });
  };
}

// Extensión/complemento de la CI boliviana ("LP", "1A", ...) — 1 a 12
// alfanuméricos en mayúscula, normalizada con normalizeDni().
export const DOCUMENT_EXTENSION_RE = /^[A-Z0-9]{1,12}$/;

/** Extensión normalizada contra `DOCUMENT_EXTENSION_RE`. */
export function IsDocumentExtension(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string): void {
    registerDecorator({
      name: 'isDocumentExtension',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown): boolean {
          return typeof value === 'string' && DOCUMENT_EXTENSION_RE.test(value);
        },
        defaultMessage(): string {
          return 'La extensión solo puede tener letras y números (hasta 12 caracteres).';
        },
      },
    });
  };
}

/**
 * La extensión solo existe en la CI — la base lo exige con
 * patients_document_extension_ci_check, así que se rechaza acá con un 400
 * en vez de dejarlo llegar como error de Postgres.
 */
export function IsOnlyForCi(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string): void {
    registerDecorator({
      name: 'isOnlyForCi',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(_value: unknown, args: ValidationArguments): boolean {
          return (
            (args.object as { documentType?: unknown }).documentType === 'ci'
          );
        },
        defaultMessage(): string {
          return 'La extensión solo se puede cargar para una CI.';
        },
      },
    });
  };
}
