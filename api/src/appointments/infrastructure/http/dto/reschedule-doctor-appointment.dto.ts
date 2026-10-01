import {
  IsIn,
  IsISO8601,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { DOCTOR_APPOINTMENT_DURATIONS } from './create-doctor-appointment.dto.js';

/** CLI-149: nuevo horario de una cita confirmada del doctor autenticado. */
export class RescheduleDoctorAppointmentDto {
  @IsISO8601({ strict: true })
  appointmentDatetime!: string;

  /** Si no viene, conserva la duración actual de la cita. */
  @IsOptional()
  @IsIn(DOCTOR_APPOINTMENT_DURATIONS)
  durationMinutes?: number;

  /** Si no viene, las notas no se tocan; vacío las borra. */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
