import { IsIn, IsOptional, IsUUID, Matches } from 'class-validator';

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export class ListAppointmentsQueryDto {
  @IsOptional()
  @IsIn(['held', 'confirmed', 'attended', 'expired'])
  status?: string;

  @IsOptional()
  @Matches(DATE_REGEX, { message: 'from debe tener el formato YYYY-MM-DD' })
  from?: string;

  @IsOptional()
  @Matches(DATE_REGEX, { message: 'to debe tener el formato YYYY-MM-DD' })
  to?: string;

  /**
   * CLI-110: `all` = agenda común (turnos de todos los doctores), para
   * cualquier odontólogo o admin; `mine` (default) = reglas de doctorId de abajo.
   */
  @IsOptional()
  @IsIn(['mine', 'all'])
  scope?: 'mine' | 'all';

  /** CLI-64: solo tiene efecto para un ADMIN — un odontólogo siempre ve su propia agenda (ver DoctorAppointmentsController). */
  @IsOptional()
  @IsUUID()
  doctorId?: string;
}
