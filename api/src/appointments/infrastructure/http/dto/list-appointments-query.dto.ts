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
   * Aceptado pero ignorado: appointments no tiene FK a un profesional
   * (clínica de un solo doctor) — no hay nada por lo que filtrar todavía.
   */
  @IsOptional()
  @IsUUID()
  doctorId?: string;
}
