import { registerDecorator, ValidationOptions } from 'class-validator';

// Espejo de frontend/src/app/shared/validation/public-name.validator.ts (CLI-254).
// El alta de doctor sugiere "Dr./Dra. Nombre Apellido" para que el admin elija:
// guardado así, los pacientes ven "Dr./Dra." al reservar y el saludo del
// panel no sabe qué título usar.
const UNDECIDED_TITLE_RE = /\bdr\.?\s*\/\s*dra\.?/i;

/** El nombre público no puede quedar con "Dr./Dra.": tiene que decir uno de los dos. */
export function NoUndecidedTitle(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string): void {
    registerDecorator({
      name: 'noUndecidedTitle',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown): boolean {
          if (typeof value !== 'string') return true; // lo rechaza @IsString()
          return !UNDECIDED_TITLE_RE.test(value);
        },
        defaultMessage(): string {
          return 'Elige "Dr." o "Dra." para el nombre público.';
        },
      },
    });
  };
}
