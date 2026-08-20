import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
} from 'class-validator';

function countWords(value: string): number {
  return value.trim().split(/\s+/).filter(Boolean).length;
}

/** Valida que un texto tenga entre `min` y `max` palabras (separadas por espacios). */
export function WordCount(
  min: number,
  max: number,
  validationOptions?: ValidationOptions,
) {
  return function (object: object, propertyName: string): void {
    registerDecorator({
      name: 'wordCount',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      constraints: [min, max],
      validator: {
        validate(value: unknown, args: ValidationArguments): boolean {
          if (typeof value !== 'string') return false;
          const [minWords, maxWords] = args.constraints as [number, number];
          const words = countWords(value);
          return words >= minWords && words <= maxWords;
        },
        defaultMessage(args: ValidationArguments): string {
          const [minWords, maxWords] = args.constraints as [number, number];
          return `${args.property} debe tener entre ${minWords} y ${maxWords} palabras`;
        },
      },
    });
  };
}
