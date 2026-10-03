import {
  IsDivisibleBy,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * Duración libre de una cita del doctor (CLI-194): de 5 minutos a 8 horas, de
 * 5 en 5. Antes eran múltiplos de 30 hasta 4 h.
 */
export const DOCTOR_APPOINTMENT_MIN_MINUTES = 5;
export const DOCTOR_APPOINTMENT_MAX_MINUTES = 8 * 60;
export const DOCTOR_APPOINTMENT_STEP_MINUTES = 5;

/** CLI-148: cita que agenda el doctor. El doctor sale del token, nunca del body. */
export class CreateDoctorAppointmentDto {
  @IsUUID()
  patientId!: string;

  @IsISO8601({ strict: true })
  appointmentDatetime!: string;

  @IsOptional()
  @IsUUID()
  treatmentId?: string;

  /** Si no viene, la del tratamiento (o una franja si tampoco hay tratamiento). */
  @IsOptional()
  @IsInt()
  @IsDivisibleBy(DOCTOR_APPOINTMENT_STEP_MINUTES)
  @Min(DOCTOR_APPOINTMENT_MIN_MINUTES)
  @Max(DOCTOR_APPOINTMENT_MAX_MINUTES)
  durationMinutes?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
