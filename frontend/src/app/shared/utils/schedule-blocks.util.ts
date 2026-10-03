/** Un tramo de atención de un día de la semana (0 = domingo … 6 = sábado), "HH:MM". */
export interface ScheduleBlock {
  weekday: number;
  start: string;
  end: string;
}

export const WEEKDAY_LABELS = [
  'Domingo',
  'Lunes',
  'Martes',
  'Miércoles',
  'Jueves',
  'Viernes',
  'Sábado',
];

function minutesOf(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

/**
 * Espejo de IsValidSchedule (api/src/admin/infrastructure/http/dto/schedule-block.dto.ts,
 * CLI-191): en cada bloque el inicio va antes del fin y los bloques de un mismo
 * día no se solapan (que se toquen está bien). Devuelve el mensaje o null.
 */
export function scheduleError(blocks: readonly ScheduleBlock[]): string | null {
  const byDay = new Map<number, [number, number][]>();
  for (const block of blocks) {
    if (!block.start || !block.end) {
      return 'Completa la hora de inicio y de fin de cada bloque.';
    }
    const start = minutesOf(block.start);
    const end = minutesOf(block.end);
    if (start >= end) {
      return 'En cada bloque la hora de inicio tiene que ser anterior a la de fin.';
    }
    const day = byDay.get(block.weekday) ?? [];
    if (day.some(([s, e]) => start < e && s < end)) {
      return 'Hay bloques del mismo día que se solapan.';
    }
    day.push([start, end]);
    byDay.set(block.weekday, day);
  }
  return null;
}
