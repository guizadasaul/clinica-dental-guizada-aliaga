export type GestationTrimester = 1 | 2 | 3;

const DAY_MS = 86_400_000;

/**
 * Trimestre derivado de la fecha de última menstruación (CLI-50) — nunca se
 * interpreta a ojo como el gestation_period de texto libre que reemplaza
 * ("2do trimestre", "20 semanas"). Semanas 1-13 = T1, 14-27 = T2, 28-42 = T3;
 * fuera de ese rango (fecha futura, o más de 42 semanas — ya no aplica o el
 * dato quedó desactualizado) devuelve null en vez de forzar un trimestre.
 */
export function gestationTrimesterFor(
  lmpDate: Date,
  asOf: Date = new Date(),
): GestationTrimester | null {
  const days = Math.floor((asOf.getTime() - lmpDate.getTime()) / DAY_MS);
  if (days < 0) {
    return null;
  }
  const weeks = days / 7;
  if (weeks <= 13) {
    return 1;
  }
  if (weeks <= 27) {
    return 2;
  }
  if (weeks <= 42) {
    return 3;
  }
  return null;
}
