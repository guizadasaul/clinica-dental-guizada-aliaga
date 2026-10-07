import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_REGEX = /^\d{4}-(0[1-9]|1[0-2])$/;

export const AGENDA_STATUSES = [
  'confirmed',
  'cancelled',
  'no_show',
  'all',
] as const;
export type AgendaStatus = (typeof AGENDA_STATUSES)[number];

/**
 * Ningún DTO del doctor acepta doctorId ni patientId: el doctor es siempre el
 * autenticado, y un paciente se busca por nombre entre sus asignados.
 */
export class MyAgendaArgsDto {
  @IsOptional()
  @Matches(DATE_REGEX, { message: 'from debe tener el formato YYYY-MM-DD' })
  from?: string;

  @IsOptional()
  @Matches(DATE_REGEX, { message: 'to debe tener el formato YYYY-MM-DD' })
  to?: string;

  @IsOptional()
  @IsIn(AGENDA_STATUSES)
  status?: AgendaStatus;
}

export class MyPatientsArgsDto {
  @IsOptional()
  @IsString()
  @MaxLength(60)
  search?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(30)
  limit?: number;
}

export class MyPatientSummaryArgsDto {
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  name!: string;
}

/** Mes de las estadísticas y del ranking de tratamientos; por defecto el actual. */
export class MyMonthArgsDto {
  @IsOptional()
  @Matches(MONTH_REGEX, { message: 'month debe tener el formato YYYY-MM' })
  month?: string;
}
