/**
 * Cálculo de horarios de atención (Bolivia, UTC-4, sin horario de verano).
 * El horario en sí (qué días/bloques atiende) ya no es fijo de la clínica —
 * es propio de cada doctor (CLI-61: doctor_schedule_blocks, CLI-56: estas
 * funciones lo reciben como parámetro en vez de leer una constante global).
 */
export const CLINIC_TIMEZONE = 'America/La_Paz';
export const CLINIC_UTC_OFFSET = '-04:00';
export const SLOT_MINUTES = 30;

export interface ScheduleBlock {
  start: string;
  end: string;
}

/** Fila plana tal como la devuelve el repositorio de horario por doctor. */
export interface WeeklyScheduleBlock extends ScheduleBlock {
  /** 0 = domingo, ..., 6 = sábado (Date#getDay / Intl weekday numbering base). */
  weekday: number;
}

/** Bloques de un doctor agrupados por día de la semana. */
export type WeeklySchedule = Record<number, readonly ScheduleBlock[]>;

/** Agrupa las filas planas de doctor_schedule_blocks por weekday. */
export function groupBlocksByWeekday(
  blocks: readonly WeeklyScheduleBlock[],
): WeeklySchedule {
  const grouped: Record<number, ScheduleBlock[]> = {};
  for (const block of blocks) {
    grouped[block.weekday] ??= [];
    grouped[block.weekday].push({ start: block.start, end: block.end });
  }
  return grouped;
}

function blocksForWeekday(
  schedule: WeeklySchedule,
  weekday: number,
): readonly ScheduleBlock[] {
  return schedule[weekday] ?? [];
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
export function buildSlotsForDate(
  date: string,
  schedule: WeeklySchedule,
): Date[] {
  const [year, month, day] = date.split('-').map(Number);
  if (!year || !month || !day) {
    return [];
  }
  const weekday = toLocalParts(
    new Date(`${date}T12:00:00${CLINIC_UTC_OFFSET}`),
  ).weekday;

  const slots: Date[] = [];
  for (const block of blocksForWeekday(schedule, weekday)) {
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
export function isValidSlot(slot: Date, schedule: WeeklySchedule): boolean {
  if (Number.isNaN(slot.getTime())) {
    return false;
  }
  const { weekday, hour, minute } = toLocalParts(slot);
  if (minute % SLOT_MINUTES !== 0) {
    return false;
  }
  const minutesOfDay = hour * 60 + minute;
  return blocksForWeekday(schedule, weekday).some((block) => {
    const [startH, startM] = block.start.split(':').map(Number);
    const [endH, endM] = block.end.split(':').map(Number);
    return (
      minutesOfDay >= startH * 60 + startM && minutesOfDay < endH * 60 + endM
    );
  });
}
