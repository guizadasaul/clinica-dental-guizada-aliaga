import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateClinicalExamDto {
  @IsOptional()
  @IsBoolean()
  tartar?: boolean;

  @IsOptional()
  @IsBoolean()
  saburra?: boolean;

  @IsOptional()
  @IsBoolean()
  bacterialPlaque?: boolean;

  @IsOptional()
  @IsBoolean()
  halitosis?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  occlusion?: string;
}
