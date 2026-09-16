import { IsOptional, IsUUID } from 'class-validator';

export class ListPatientsQueryDto {
  /** CLI-58: filtro de conveniencia ("todos" / "los míos"), no de seguridad. */
  @IsOptional()
  @IsUUID()
  doctorId?: string;
}
