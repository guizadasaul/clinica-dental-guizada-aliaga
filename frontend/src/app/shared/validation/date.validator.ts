// Espejo de api/src/shared/validators/date.validator.ts — cambiar los dos
// juntos. Las tres validan fechas en formato ISO (yyyy-mm-dd, lo que emite
// <input type="date">). Funciones puras, sin Angular.

function parseIsoDate(value: string): Date | null {
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
export function isNotFutureDate(value: string): boolean {
  const date = parseIsoDate(value);
  if (!date) return false;
  return date.getTime() <= Date.now();
}

/** Edad en años (a la fecha de hoy) entre `min` y `max`, inclusive. */
export function isAgeWithin(value: string, min: number, max: number): boolean {
  const date = parseIsoDate(value);
  if (!date) return false;
  const age = ageInYears(date, new Date());
  return age >= min && age <= max;
}

/**
 * `value` no puede ser anterior a `relatedValue` (ej. `lastDentistVisit` no
 * puede ser anterior a `birthDate`). Si `relatedValue` no es una fecha
 * válida, no aplica — no es responsabilidad de esta función exigir el otro
 * campo, solo compararlos cuando los dos existen.
 */
export function isNotBefore(value: string, relatedValue: string): boolean {
  const date = parseIsoDate(value);
  if (!date) return false;
  const relatedDate = parseIsoDate(relatedValue);
  if (!relatedDate) return true;
  return date.getTime() >= relatedDate.getTime();
}
