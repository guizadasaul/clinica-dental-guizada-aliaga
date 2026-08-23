import { registerDecorator, ValidationOptions } from 'class-validator';

// Espejo de frontend/src/app/shared/validation/tooth.validator.ts — cambiar
// los dos juntos. Numeración FDI (ISO 3950): dos dígitos, cuadrante +
// posición. Cuadrante 1-4 = dentición permanente, posición 1-8 (32 dientes).
// Cuadrante 5-8 = dentición temporal/decidua, posición 1-5 (20 dientes).
// Un @Min(11) @Max(85) desnudo deja pasar códigos que no existen en ningún
// cuadrante (19, 20, 39, 56, 79, etc.) — este validador cierra ese hueco.

/** 'permanent' | 'deciduous' según el cuadrante, o null si no es un diente FDI válido. */
export function toothTypeFor(
  toothNumber: number,
): 'permanent' | 'deciduous' | null {
  if (!Number.isInteger(toothNumber)) return null;
  const quadrant = Math.floor(toothNumber / 10);
  const position = toothNumber % 10;
  if (quadrant >= 1 && quadrant <= 4 && position >= 1 && position <= 8) {
    return 'permanent';
  }
  if (quadrant >= 5 && quadrant <= 8 && position >= 1 && position <= 5) {
    return 'deciduous';
  }
  return null;
}

/** Número de diente válido en numeración FDI (ver `toothTypeFor`). */
export function IsFdiToothNumber(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string): void {
    registerDecorator({
      name: 'isFdiToothNumber',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown): boolean {
          if (typeof value !== 'number') return false;
          return toothTypeFor(value) !== null;
        },
        defaultMessage(): string {
          return 'El número de diente no es válido (numeración FDI).';
        },
      },
    });
  };
}
