import {
  IsInt,
  IsUUID,
  IsNumber,
  IsPositive,
  IsOptional,
  IsBoolean,
  IsDateString,
  IsString,
  Min,
} from 'class-validator';

export class CreateToothProcedureDto {
  @IsInt()
  @Min(11)
  toothNumber!: number;

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
  @IsString()
  notes?: string;
}
