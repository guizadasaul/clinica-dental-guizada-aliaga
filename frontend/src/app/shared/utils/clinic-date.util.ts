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
