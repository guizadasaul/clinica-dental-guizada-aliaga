import type { DoctorScheduleBlock } from './appointment.model';

/** Bolivia es UTC-4 fijo, sin horario de verano. */
const LA_PAZ_OFFSET = '-04:00';

/** "HH:MM" → minutos desde la medianoche. */
export function toMinutes(hhmm: string): number {
  const [hours, minutes] = hhmm.split(':').map(Number);
  return hours * 60 + minutes;
}

/** Minutos desde la medianoche → "HH:MM". */
export function minutesToHhmm(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  return `${String(hours).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

/** Instante ISO de un horario de la clínica: día "YYYY-MM-DD" + minutos desde la medianoche de Bolivia. */
export function clinicSlotIso(date: string, minutes: number): string {
  return `${date}T${minutesToHhmm(minutes)}:00${LA_PAZ_OFFSET}`;
}

/** 0 = domingo … 6 = sábado, del día calendario "YYYY-MM-DD". */
export function weekdayOf(date: string): number {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

/**
 * Si un turno de `durationMinutes` que empieza a `startMinutes` del día `date`
 * cae entero dentro de algún bloque del horario de atención (CLI-150) — si no,
 * la agenda avisa que está fuera de horario (igual se puede agendar).
 */
export function isWithinSchedule(
  blocks: readonly DoctorScheduleBlock[],
  date: string,
  startMinutes: number,
  durationMinutes: number,
): boolean {
  const weekday = weekdayOf(date);
  const end = startMinutes + durationMinutes;
  return blocks.some(
    (b) => b.weekday === weekday && toMinutes(b.start) <= startMinutes && end <= toMinutes(b.end),
  );
}
