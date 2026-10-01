import { IsOptional, IsString, MaxLength } from 'class-validator';

/** CLI-149: el motivo, si viene, se agrega a las notas de la cita. */
export class CancelDoctorAppointmentDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  reason?: string;
}
