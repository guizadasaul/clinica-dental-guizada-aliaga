/** Zona horaria de la clínica (Bolivia, UTC-4 sin horario de verano). */
export const CLINIC_TIME_ZONE = 'America/La_Paz';

const CLINIC_DATE_FORMATTER = new Intl.DateTimeFormat('en-CA', { timeZone: CLINIC_TIME_ZONE });

/**
 * Fecha YYYY-MM-DD en la clínica (CLI-180). `toISOString()` da la fecha en
 * UTC: después de las 20:00 en Bolivia ya devuelve la de mañana.
 */
export function clinicToday(now: Date = new Date()): string {
  return CLINIC_DATE_FORMATTER.format(now);
}

const DAY_MS = 86_400_000;

/** Días de calendario (en la clínica) entre hoy y la fecha: 0 = hoy, 1 = mañana, -1 = ayer. */
export function clinicDayDiff(iso: string, now: Date = new Date()): number {
  const day = (d: Date) => Date.parse(`${clinicToday(d)}T00:00:00Z`);
  return Math.round((day(new Date(iso)) - day(now)) / DAY_MS);
}

/** "Hoy", "Mañana", "En 5 días", "Ayer", "Hace 3 días" — según el día de calendario en Bolivia (CLI-267). */
export function relativeDayLabel(iso: string, now: Date = new Date()): string {
  const diff = clinicDayDiff(iso, now);
  if (diff === 0) { return 'Hoy'; }
  if (diff === 1) { return 'Mañana'; }
  if (diff === -1) { return 'Ayer'; }
  return diff > 0 ? `En ${diff} días` : `Hace ${-diff} días`;
}
