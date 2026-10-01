import { IsInt, IsOptional, IsUUID, Matches, Max, Min } from 'class-validator';

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/** El admin puede filtrar por cualquier doctor (CLI-64/65): doctorId opcional. */
export class ClinicReportArgsDto {
  @Matches(DATE_REGEX, { message: 'from debe tener el formato YYYY-MM-DD' })
  from!: string;

  @Matches(DATE_REGEX, { message: 'to debe tener el formato YYYY-MM-DD' })
  to!: string;

  @IsOptional()
  @IsUUID()
  doctorId?: string;
}

export class ClinicAgendaArgsDto {
  @IsOptional()
  @Matches(DATE_REGEX, { message: 'date debe tener el formato YYYY-MM-DD' })
  date?: string;

  @IsOptional()
  @IsUUID()
  doctorId?: string;
}

export class TopTreatmentsArgsDto extends ClinicReportArgsDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  limit?: number;
}
