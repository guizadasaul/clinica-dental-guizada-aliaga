import { registerDecorator, ValidationOptions } from 'class-validator';
import {
  isValidPhoneNumber,
  validatePhoneNumberLength,
} from 'libphonenumber-js';

// Espejo de frontend/src/app/shared/validation/phone.validator.ts — cambiar
// los dos juntos. Formato E.164: '+' seguido de 7 a 15 dígitos, el primero
// distinto de 0 (código de país nunca empieza con 0).
export const E164_RE = /^\+[1-9]\d{6,14}$/;

/**
 * Regex E.164 **y** validación real de número/longitud por país vía
 * `libphonenumber-js` — el regex solo verifica la forma, no que el número
 * sea asignable dentro de ese país (ej. `+591123` tiene forma válida pero
 * es demasiado corto para Bolivia).
 */
export function IsE164Phone(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string): void {
    registerDecorator({
      name: 'isE164Phone',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown): boolean {
          if (typeof value !== 'string') return false;
          if (!E164_RE.test(value)) return false;
          if (validatePhoneNumberLength(value) !== undefined) return false;
          return isValidPhoneNumber(value);
        },
        defaultMessage(): string {
          return 'El teléfono no es válido.';
        },
      },
    });
  };
}
