import { IsInt, Matches, Max, Min } from 'class-validator';

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
