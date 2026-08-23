// Espejo de api/src/shared/validators/dni.validator.ts — cambiar los dos
// juntos. DNI opcional: 5 a 15 caracteres alfanuméricos en mayúscula, sin
// puntos/espacios/guiones (se normaliza antes de validar). dni es @unique
// en la base — "12.345.678" y "12345678" tienen que terminar siendo el
// mismo valor guardado. Funciones puras, sin Angular.

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

/** DNI (ya normalizado internamente) contra `DNI_RE` — 5 a 15 alfanuméricos en mayúscula. */
export function isValidDni(value: string): boolean {
  return DNI_RE.test(normalizeDni(value));
}
