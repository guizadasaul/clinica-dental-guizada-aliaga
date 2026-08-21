/**
 * Marca un DTO como "tolera propiedades no declaradas", exceptuándolo del
 * `forbidNonWhitelisted: true` global (ver api/src/app.config.ts).
 *
 * Existe porque en NestJS un `@UsePipes(new ValidationPipe(...))` a nivel de
 * controller o de handler **no reemplaza** al pipe global: los dos corren, el
 * global primero. Así que un override local no puede aflojar una regla que el
 * global ya aplicó — para cuando corre el permisivo, el estricto ya tiró 400.
 * La única forma de exceptuar una ruta es que el propio pipe global lo sepa.
 *
 * Usar solo en payloads de terceros que no controlamos y que pueden sumar
 * campos sin avisarnos (hoy: el webhook de BANECO). Nunca en un DTO
 * alimentado por nuestro propio frontend — ahí un campo de más es un bug y
 * queremos el 400.
 */
const ALLOW_UNKNOWN = Symbol('allowUnknownProperties');

export function AllowUnknownProperties(): ClassDecorator {
  return (target) => {
    Object.defineProperty(target, ALLOW_UNKNOWN, { value: true });
  };
}

export function allowsUnknownProperties(metatype: unknown): boolean {
  return (
    typeof metatype === 'function' &&
    (metatype as unknown as Record<symbol, unknown>)[ALLOW_UNKNOWN] === true
  );
}
