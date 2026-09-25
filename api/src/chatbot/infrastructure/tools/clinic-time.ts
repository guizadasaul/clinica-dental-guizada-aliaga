import { CLINIC_TIMEZONE } from '../../../appointments/domain/ClinicSchedule.js';

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
