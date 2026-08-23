// Sin espejo 1:1 en el backend: `@Trim()` (api/src/shared/validators/transforms.ts)
// solo recorta los bordes, no colapsa espacios internos repetidos. Acá sí, para
// que el texto libre del wizard (motivo de consulta, notas, etc.) se muestre y se
// guarde siempre igual, sin importar cuántos espacios haya tipeado el doctor.
// Mismo criterio de header que el resto de shared/validation/ — cambiar junto a
// text-safety.validator.ts si cambia el criterio de qué es "HTML" en el texto.

import { hasHtml } from './text-safety.validator';

/** trim() + colapsar espacios repetidos. "  hola   mundo " → "hola mundo". */
export function normalizeText(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

/**
 * Texto libre OPCIONAL: null (sin error) si está vacío. Si tiene contenido,
 * valida largo mínimo/máximo y ausencia de HTML — el mismo trío de reglas
 * que `@MinLength` + `@MaxLength` + `@NoHtml()` aplican en cada DTO del
 * wizard. `minLength` es opcional para no romper firmas existentes.
 */
export function optionalTextError(
  value: string,
  maxLength: number,
  minLength?: number,
): string | null {
  const normalized = normalizeText(value);
  if (!normalized) return null;
  if (minLength && normalized.length < minLength) {
    return `Tiene que tener al menos ${minLength} caracteres.`;
  }
  if (normalized.length > maxLength) return `No puede superar los ${maxLength} caracteres.`;
  if (hasHtml(normalized)) return 'No se permite HTML en el texto.';
  return null;
}

/** Igual que `optionalTextError`, pero además exige el campo (no vacío, y opcionalmente un mínimo). */
export function requiredTextError(
  value: string,
  maxLength: number,
  options?: { minLength?: number },
): string | null {
  const normalized = normalizeText(value);
  if (!normalized) return 'Este campo es obligatorio.';
  const minLength = options?.minLength;
  if (minLength && normalized.length < minLength) {
    return `Tiene que tener al menos ${minLength} caracteres.`;
  }
  if (normalized.length > maxLength) return `No puede superar los ${maxLength} caracteres.`;
  if (hasHtml(normalized)) return 'No se permite HTML en el texto.';
  return null;
}
