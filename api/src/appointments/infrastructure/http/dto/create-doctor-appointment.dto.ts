import {
  IsIn,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

/** Duraciones que el doctor puede elegir al agendar: múltiplos de la franja de 30 min, hasta 4 h. */
export const DOCTOR_APPOINTMENT_DURATIONS = [
  30, 60, 90, 120, 150, 180, 210, 240,
];

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
  @IsIn(DOCTOR_APPOINTMENT_DURATIONS)
  durationMinutes?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
