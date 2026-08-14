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
  TREATMENT_CURRENCIES,
  TREATMENT_SCOPES,
} from '../../../domain/TreatmentScope.js';
import type {
  TreatmentCurrency,
  TreatmentScope,
} from '../../../domain/TreatmentScope.js';

export class CreateTreatmentDto {
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

  @IsIn(TREATMENT_SCOPES)
  scope!: TreatmentScope;

  @IsIn(TREATMENT_CURRENCIES)
  currency!: TreatmentCurrency;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
