import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
} from 'class-validator';

// Espejo de frontend/src/app/shared/validation/date.validator.ts — cambiar
// los dos juntos. Las tres validan fechas en formato ISO (yyyy-mm-dd, lo que
// emiten @IsDateString() y <input type="date">).

function parseIsoDate(value: unknown): Date | null {
  if (typeof value !== 'string' || value.trim() === '') return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Diferencia en años cumplidos entre dos fechas (`from` es la más antigua). */
function ageInYears(from: Date, to: Date): number {
  let age = to.getFullYear() - from.getFullYear();
  const monthDiff = to.getMonth() - from.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && to.getDate() < from.getDate())) {
    age -= 1;
  }
  return age;
}

/** La fecha no puede ser posterior a hoy. */
export function IsNotFutureDate(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string): void {
    registerDecorator({
      name: 'isNotFutureDate',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown): boolean {
          const date = parseIsoDate(value);
          if (!date) return false;
          return date.getTime() <= Date.now();
        },
        defaultMessage(): string {
          return 'La fecha no puede ser futura.';
        },
      },
    });
  };
}

/** Edad en años (a la fecha de hoy) entre `min` y `max`, inclusive. */
export function IsAgeWithin(
  min: number,
  max: number,
  validationOptions?: ValidationOptions,
) {
  return function (object: object, propertyName: string): void {
    registerDecorator({
      name: 'isAgeWithin',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      constraints: [min, max],
      validator: {
        validate(value: unknown, args: ValidationArguments): boolean {
          const date = parseIsoDate(value);
          if (!date) return false;
          const [minAge, maxAge] = args.constraints as [number, number];
          const age = ageInYears(date, new Date());
          return age >= minAge && age <= maxAge;
        },
        defaultMessage(args: ValidationArguments): string {
          const [minAge, maxAge] = args.constraints as [number, number];
          return `La edad tiene que estar entre ${minAge} y ${maxAge} años.`;
        },
      },
    });
  };
}

/**
 * La fecha no puede ser anterior a la de otro campo del mismo objeto (ej.
 * `lastDentistVisit` no puede ser anterior a `birthDate`). Si el campo
 * relacionado no está presente o no es una fecha válida, no aplica — no es
 * responsabilidad de este validador exigir el otro campo, solo compararlos
 * cuando los dos existen.
 */
export function IsNotBefore(
  property: string,
  validationOptions?: ValidationOptions,
) {
  return function (object: object, propertyName: string): void {
    registerDecorator({
      name: 'isNotBefore',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      constraints: [property],
      validator: {
        validate(value: unknown, args: ValidationArguments): boolean {
          const date = parseIsoDate(value);
          if (!date) return false;
          const [relatedProperty] = args.constraints as [string];
          const relatedValue = (args.object as Record<string, unknown>)[
            relatedProperty
          ];
          const relatedDate = parseIsoDate(relatedValue);
          if (!relatedDate) return true;
          return date.getTime() >= relatedDate.getTime();
        },
        defaultMessage(args: ValidationArguments): string {
          const [relatedProperty] = args.constraints as [string];
          return `La fecha no puede ser anterior a ${relatedProperty}.`;
        },
      },
    });
  };
}
