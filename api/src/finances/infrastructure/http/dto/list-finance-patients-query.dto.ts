import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ListFinancePatientsQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;
}
