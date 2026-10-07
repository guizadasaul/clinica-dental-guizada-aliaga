import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
} from 'class-validator';

// Espejo de frontend/src/app/shared/validation/dni.validator.ts — cambiar los
// dos juntos. Número de documento (CI, NIT o pasaporte), CLI-177: 5 a 12
// caracteres, solo letras en mayúscula, números y guiones medios, empezando y
// terminando en letra o número. Sin espacios ni puntos: se rechazan, no se
// borran en silencio. La extensión de la CI va dentro, con guion (1234567-LP).
// (document_type, dni) es único en la base.
export const DNI_MAX_LENGTH = 12;
export const DNI_RE = /^[A-Z0-9][A-Z0-9-]{3,10}[A-Z0-9]$/;

/**
 * Normaliza un número de documento para guardarlo siempre igual: recorta los
 * bordes y pasa a mayúsculas. No quita nada del medio (espacios, puntos ni
 * guiones): lo que no está permitido lo rechaza la validación.
 */
export function normalizeDni(value: string): string {
  return value.trim().toUpperCase();
}

const DOCUMENT_NAMES: Record<string, string> = {
  ci: 'El número de CI',
  nit: 'El número de NIT',
  pasaporte: 'El número de pasaporte',
};

/** "El número de CI" / "de NIT" / "de pasaporte" según el tipo elegido; "El número de documento" si no hay. */
export function documentNumberLabel(documentType: unknown): string {
  return (
    (typeof documentType === 'string' && DOCUMENT_NAMES[documentType]) ||
    'El número de documento'
  );
}

/** Mensaje de formato inválido, nombrando el tipo de documento (nunca "DNI"). */
export function dniFormatMessage(documentType: unknown): string {
  const base = `${documentNumberLabel(documentType)} solo puede tener letras, números y guiones, sin espacios ni puntos (5 a ${DNI_MAX_LENGTH} caracteres).`;
  return documentType === 'ci'
    ? `${base} La extensión va con guion, por ejemplo 1234567-LP.`
    : base;
}

/** Número de documento normalizado contra `DNI_RE`. */
export function IsDni(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string): void {
    registerDecorator({
      name: 'isDni',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown): boolean {
          return typeof value === 'string' && DNI_RE.test(value);
        },
        defaultMessage(args: ValidationArguments): string {
          return dniFormatMessage(
            (args.object as { documentType?: unknown }).documentType,
          );
        },
      },
    });
  };
}
