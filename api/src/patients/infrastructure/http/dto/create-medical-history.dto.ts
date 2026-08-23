import {
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import {
  EmptyToUndefined,
  Trim,
} from '../../../../shared/validators/transforms.js';
import { NoHtml } from '../../../../shared/validators/text-safety.validator.js';

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
  @EmptyToUndefined()
  @Trim()
  @IsString()
  @MinLength(3)
  @MaxLength(1000)
  @NoHtml()
  otherDiseases?: string;

  @IsOptional()
  @EmptyToUndefined()
  @Trim()
  @IsString()
  @MinLength(3)
  @MaxLength(100)
  @NoHtml()
  gestationPeriod?: string;

  // Tri-estado (Sí / No / No sabe): boolean nullable a propósito, sin
  // default. @IsOptional() deja pasar tanto `undefined` como `null`.
  @IsOptional()
  @IsBoolean()
  anesthesiaReactions?: boolean | null;

  @IsOptional()
  @EmptyToUndefined()
  @Trim()
  @IsString()
  @MinLength(3)
  @MaxLength(1000)
  @NoHtml()
  currentMedications?: string;
}
