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

  // Texto libre a propósito (decisión clínica, no limpieza) — sin @IsIn().
  @IsOptional()
  @EmptyToUndefined()
  @Trim()
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  @NoHtml()
  occlusion?: string;
}
