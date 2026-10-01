import { IsInt, IsOptional, Matches, Max, Min } from 'class-validator';

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_REGEX = /^\d{4}-(0[1-9]|1[0-2])$/;

/** Ningún DTO del doctor acepta doctorId: siempre es el doctor autenticado. */
export class MyAgendaArgsDto {
  @IsOptional()
  @Matches(DATE_REGEX, { message: 'from debe tener el formato YYYY-MM-DD' })
  from?: string;

  @IsOptional()
  @Matches(DATE_REGEX, { message: 'to debe tener el formato YYYY-MM-DD' })
  to?: string;
}

export class MyPatientsArgsDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(30)
  limit?: number;
}

export class MyMonthlyStatsArgsDto {
  @IsOptional()
  @Matches(MONTH_REGEX, { message: 'month debe tener el formato YYYY-MM' })
  month?: string;
}
