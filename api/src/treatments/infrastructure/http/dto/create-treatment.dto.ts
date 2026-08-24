import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Min,
  MaxLength,
} from 'class-validator';
import {
  TREATMENT_APPLICATION_TYPES,
  TREATMENT_CURRENCIES,
} from '../../../domain/TreatmentApplicationType.js';
import type {
  TreatmentApplicationType,
  TreatmentCurrency,
} from '../../../domain/TreatmentApplicationType.js';

export class CreateTreatmentDto {
  @IsString()
  @MaxLength(50)
  code!: string;

  @IsString()
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  basePrice!: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  estimatedMinutes?: number;

  @IsIn(TREATMENT_APPLICATION_TYPES)
  applicationType!: TreatmentApplicationType;

  @IsIn(TREATMENT_CURRENCIES)
  currency!: TreatmentCurrency;

  @IsString()
  @MaxLength(50)
  categoryCode!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  displayOrder?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
