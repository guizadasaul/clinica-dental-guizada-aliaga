import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

/** Ningún DTO del paciente acepta patientId/userId: la identidad sale del actor. */
export class MyAppointmentsArgsDto {
  @IsIn(['upcoming', 'past'])
  scope!: 'upcoming' | 'past';

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  limit?: number;
}

export class MyTreatmentsArgsDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  limit?: number;
}
