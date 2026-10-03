import {
  IsInt,
  Matches,
  Max,
  Min,
  registerDecorator,
  ValidationOptions,
} from 'class-validator';

// Mismo formato "HH:MM" que doctor_schedule_blocks.start_time/end_time
// (VARCHAR(5)) — espejo de E164_RE en phone.validator.ts, regex propio acá
// porque no hay otro DTO de horario en el repo para reusar.
export const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export class ScheduleBlockDto {
  // 0 = domingo, ..., 6 = sábado, mismo criterio que Date#getDay.
  @IsInt()
  @Min(0)
  @Max(6)
  weekday: number;

  @Matches(TIME_RE, { message: 'start no tiene un formato válido (HH:MM)' })
  start: string;

  @Matches(TIME_RE, { message: 'end no tiene un formato válido (HH:MM)' })
  end: string;
}

function minutesOf(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

/**
 * Un horario semanal coherente (CLI-191): en cada bloque el inicio va antes
 * que el fin, y los bloques de un mismo día no se solapan (dos bloques que se
 * tocan, 08:00–12:00 y 12:00–18:00, están bien). Va sobre el array completo
 * de bloques, junto con @ValidateNested.
 */
export function IsValidSchedule(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string): void {
    registerDecorator({
      name: 'isValidSchedule',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown): boolean {
          if (!Array.isArray(value)) return false;
          const blocks = value as ScheduleBlockDto[];
          const byDay = new Map<number, [number, number][]>();
          for (const block of blocks) {
            if (
              typeof block?.start !== 'string' ||
              typeof block?.end !== 'string' ||
              !TIME_RE.test(block.start) ||
              !TIME_RE.test(block.end)
            ) {
              // El formato lo reporta @ValidateNested; acá no se duplica el error.
              continue;
            }
            const start = minutesOf(block.start);
            const end = minutesOf(block.end);
            if (start >= end) return false;
            const day = byDay.get(block.weekday) ?? [];
            if (day.some(([s, e]) => start < e && s < end)) return false;
            day.push([start, end]);
            byDay.set(block.weekday, day);
          }
          return true;
        },
        defaultMessage(): string {
          return 'El horario no es válido: en cada bloque el inicio va antes del fin y los bloques de un mismo día no se solapan.';
        },
      },
    });
  };
}
