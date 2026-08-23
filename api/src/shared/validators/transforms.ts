import { Transform } from 'class-transformer';
import { normalizeFullName } from './full-name.validator.js';
import { normalizeDni } from './dni.validator.js';

// Espejo de frontend/src/app/shared/validation/transforms.ts — cambiar los
// dos juntos. Decoradores compuestos sobre @Transform de class-transformer,
// para no repetir la misma función anónima inline ~30 veces en los DTOs del
// wizard. El ValidationPipe global corre con `transform: true`
// (api/src/app.config.ts), así que estos @Transform sí se ejecutan antes de
// que class-validator valide.

/** trim() sin tocar mayúsculas/minúsculas. No-op si el valor no es string. */
export function Trim(): PropertyDecorator {
  return Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  );
}

/** normalizeFullName() — ver full-name.validator.ts. */
export function NormalizeName(): PropertyDecorator {
  return Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? normalizeFullName(value) : value,
  );
}

/** normalizeDni() — ver dni.validator.ts. */
export function NormalizeDni(): PropertyDecorator {
  return Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? normalizeDni(value) : value,
  );
}

/**
 * "" → undefined. Necesario en todo campo de texto opcional: con
 * `@IsOptional()` un string vacío pasa `@IsString()` igual y terminaría
 * guardado como "" en vez de quedar sin definir — y el adaptador Prisma solo
 * pisa la columna cuando el valor `!== undefined` (ver
 * prisma-patients.repository.ts), así que "" se guardaría de más en un
 * update parcial.
 */
export function EmptyToUndefined(): PropertyDecorator {
  return Transform(({ value }: { value: unknown }) =>
    value === '' ? undefined : value,
  );
}
