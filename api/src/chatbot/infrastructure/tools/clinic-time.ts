import {
  CLINIC_TIMEZONE,
  CLINIC_UTC_OFFSET,
} from '../../../appointments/domain/ClinicSchedule.js';

const DATE_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: CLINIC_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const TIME_FORMATTER = new Intl.DateTimeFormat('en-GB', {
  timeZone: CLINIC_TIMEZONE,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** YYYY-MM-DD de un instante en el huso de la clínica (en-CA formatea así). */
export function clinicDate(instant: Date): string {
  return DATE_FORMATTER.format(instant);
}

/** HH:mm de un instante en el huso de la clínica. */
export function clinicTime(instant: Date): string {
  return TIME_FORMATTER.format(instant);
}

/** Minúsculas y sin tildes, para comparar texto que escribe el usuario. */
export function normalizeText(text: string): string {
  return text
    .normalize('NFD')
    .replaceAll(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();
}

/** Medianoche (inicio del día) de una fecha YYYY-MM-DD en el huso de la clínica. */
export function clinicDayStart(date: string): Date {
  return new Date(`${date}T00:00:00${CLINIC_UTC_OFFSET}`);
}

/** YYYY-MM-DD sumando días de calendario (Bolivia no tiene horario de verano). */
export function addDays(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + days));
  return next.toISOString().slice(0, 10);
}

/** Días entre dos fechas YYYY-MM-DD (to - from). */
export function daysBetween(from: string, to: string): number {
  return Math.round(
    (clinicDayStart(to).getTime() - clinicDayStart(from).getTime()) /
      86_400_000,
  );
}
