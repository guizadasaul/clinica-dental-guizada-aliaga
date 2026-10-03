import {
  IsDivisibleBy,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  DOCTOR_APPOINTMENT_MAX_MINUTES,
  DOCTOR_APPOINTMENT_MIN_MINUTES,
  DOCTOR_APPOINTMENT_STEP_MINUTES,
} from './create-doctor-appointment.dto.js';

/** CLI-149: nuevo horario de una cita confirmada del doctor autenticado. */
export class RescheduleDoctorAppointmentDto {
  @IsISO8601({ strict: true })
  appointmentDatetime!: string;

  /** Si no viene, conserva la duración actual de la cita. Libre, de 5 en 5 (CLI-194). */
  @IsOptional()
  @IsInt()
  @IsDivisibleBy(DOCTOR_APPOINTMENT_STEP_MINUTES)
  @Min(DOCTOR_APPOINTMENT_MIN_MINUTES)
  @Max(DOCTOR_APPOINTMENT_MAX_MINUTES)
  durationMinutes?: number;

  /** Si no viene, las notas no se tocan; vacío las borra. */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
