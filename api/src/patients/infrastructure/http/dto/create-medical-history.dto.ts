import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class CreateMedicalHistoryDto {
  @IsOptional()
  @IsBoolean()
  hasAllergies?: boolean;

  @IsOptional()
  @IsBoolean()
  kidneyProblems?: boolean;

  @IsOptional()
  @IsBoolean()
  ulcers?: boolean;

  @IsOptional()
  @IsBoolean()
  rheumatism?: boolean;

  @IsOptional()
  @IsBoolean()
  heartProblems?: boolean;

  @IsOptional()
  @IsBoolean()
  diabetes?: boolean;

  @IsOptional()
  @IsBoolean()
  hypertension?: boolean;

  @IsOptional()
  @IsBoolean()
  hemorrhages?: boolean;

  @IsOptional()
  @IsBoolean()
  anemia?: boolean;

  @IsOptional()
  @IsBoolean()
  sti?: boolean;

  @IsOptional()
  @IsString()
  otherDiseases?: string;

  @IsOptional()
  @IsString()
  gestationPeriod?: string;

  @IsOptional()
  @IsBoolean()
  anesthesiaReactions?: boolean;

  @IsOptional()
  @IsString()
  currentMedications?: string;
}
