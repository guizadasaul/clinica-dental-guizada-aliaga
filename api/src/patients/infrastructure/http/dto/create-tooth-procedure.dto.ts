import {
  IsArray,
  IsInt,
  IsUUID,
  IsNumber,
  IsPositive,
  IsOptional,
  IsBoolean,
  IsDateString,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import {
  EmptyToUndefined,
  Trim,
} from '../../../../shared/validators/transforms.js';
import { NoHtml } from '../../../../shared/validators/text-safety.validator.js';

export class CreateToothProcedureDto {
  /**
   * Vacío para tratamientos de arcada/boca completa o sin diente (el scope
   * del tratamiento decide si acepta 0, 1 o 2+ — no se valida acá, ver
   * assertTeethMatchScope en patients.service.ts).
   */
  @IsArray()
  @IsInt({ each: true })
  @Min(11, { each: true })
  @Max(85, { each: true })
  toothNumbers!: number[];

  @IsUUID()
  treatmentId!: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  priceCharged!: number;

  @IsOptional()
  @IsDateString()
  procedureDate?: string;

  @IsOptional()
  @IsBoolean()
  surfaceVestibular?: boolean;

  @IsOptional()
  @IsBoolean()
  surfacePalatal?: boolean;

  @IsOptional()
  @IsBoolean()
  surfaceMesial?: boolean;

  @IsOptional()
  @IsBoolean()
  surfaceDistal?: boolean;

  @IsOptional()
  @IsBoolean()
  surfaceOcclusal?: boolean;

  @IsOptional()
  @EmptyToUndefined()
  @Trim()
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  @NoHtml()
  notes?: string;
}
