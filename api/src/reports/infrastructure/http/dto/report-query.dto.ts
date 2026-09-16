import { IsOptional, IsUUID, Matches } from 'class-validator';

// Mismo regex que ListAppointmentsQueryDto (appointments/).
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export class ReportQueryDto {
  @Matches(DATE_REGEX, { message: 'from debe tener el formato YYYY-MM-DD' })
  from!: string;

  @Matches(DATE_REGEX, { message: 'to debe tener el formato YYYY-MM-DD' })
  to!: string;

  /** Si no viene, el reporte agrega sobre todos los doctores. */
  @IsOptional()
  @IsUUID()
  doctorId?: string;
}
