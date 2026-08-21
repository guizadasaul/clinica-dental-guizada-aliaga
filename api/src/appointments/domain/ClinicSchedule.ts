/**
 * Horario de atención de la clínica (Bolivia, UTC-4, sin horario de verano).
 * Lunes a viernes: 09:00–12:00 y 15:00–19:00 (con turnos de 30 min, el
 * último arranca a las 18:30). Sábados: 09:00–12:00 (último turno 11:30).
 * Domingo cerrado. Coincide con lo que ya muestra el pie de la landing
 * (`landing.contact.hoursWeekdays` / `hoursSaturday` en los i18n).
 */
export const CLINIC_TIMEZONE = 'America/La_Paz';
export const CLINIC_UTC_OFFSET = '-04:00';
export const SLOT_MINUTES = 30;

interface ScheduleBlock {
  start: string;
  end: string;
}

const WEEKDAY_BLOCKS: Record<number, readonly ScheduleBlock[]> = {
  // 0 = domingo, ..., 6 = sábado (Date#getDay / Intl weekday numbering base)
  1: [
    { start: '09:00', end: '12:00' },
    { start: '15:00', end: '19:00' },
  ], // lunes
  2: [
    { start: '09:00', end: '12:00' },
    { start: '15:00', end: '19:00' },
  ], // martes
  3: [
    { start: '09:00', end: '12:00' },
    { start: '15:00', end: '19:00' },
  ], // miércoles
  4: [
    { start: '09:00', end: '12:00' },
    { start: '15:00', end: '19:00' },
  ], // jueves
  5: [
    { start: '09:00', end: '12:00' },
    { start: '15:00', end: '19:00' },
  ], // viernes
  6: [{ start: '09:00', end: '12:00' }], // sábado
  // domingo (0): sin entrada — sin bloques, cerrado.
};

function blocksForWeekday(weekday: number): readonly ScheduleBlock[] {
  return WEEKDAY_BLOCKS[weekday] ?? [];
}

interface LocalDateParts {
  year: number;
  month: number;
  day: number;
  weekday: number;
  hour: number;
  minute: number;
}

const partsFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: CLINIC_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  weekday: 'short',
});

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

function toLocalParts(instant: Date): LocalDateParts {
  const parts = partsFormatter.formatToParts(instant);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return {
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day')),
    weekday: WEEKDAY_INDEX[get('weekday')] ?? -1,
    hour: get('hour') === '24' ? 0 : Number(get('hour')),
    minute: Number(get('minute')),
  };
}

function pad2(n: number): string {
  return n.toString().padStart(2, '0');
}

/** Construye los horarios disponibles (inicio de turno) de un día dado, en orden. */
export function buildSlotsForDate(date: string): Date[] {
  const [year, month, day] = date.split('-').map(Number);
  if (!year || !month || !day) {
    return [];
  }
  const weekday = toLocalParts(
    new Date(`${date}T12:00:00${CLINIC_UTC_OFFSET}`),
  ).weekday;

  const slots: Date[] = [];
  for (const block of blocksForWeekday(weekday)) {
    const [startH, startM] = block.start.split(':').map(Number);
    const [endH, endM] = block.end.split(':').map(Number);
    const blockStartMinutes = startH * 60 + startM;
    const blockEndMinutes = endH * 60 + endM;
    for (let m = blockStartMinutes; m < blockEndMinutes; m += SLOT_MINUTES) {
      const hh = Math.floor(m / 60);
      const mm = m % 60;
      slots.push(
        new Date(`${date}T${pad2(hh)}:${pad2(mm)}:00${CLINIC_UTC_OFFSET}`),
      );
    }
  }
  return slots;
}

/** true si el slot cae exactamente en la grilla de un bloque de atención vigente. */
export function isValidSlot(slot: Date): boolean {
  if (Number.isNaN(slot.getTime())) {
    return false;
  }
  const { weekday, hour, minute } = toLocalParts(slot);
  if (minute % SLOT_MINUTES !== 0) {
    return false;
  }
  const minutesOfDay = hour * 60 + minute;
  return blocksForWeekday(weekday).some((block) => {
    const [startH, startM] = block.start.split(':').map(Number);
    const [endH, endM] = block.end.split(':').map(Number);
    return (
      minutesOfDay >= startH * 60 + startM && minutesOfDay < endH * 60 + endM
    );
  });
}
