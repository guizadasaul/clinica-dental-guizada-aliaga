import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  Max,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateOdontogramEntryDto {
  @IsInt()
  @Min(11)
  @Max(85)
  toothNumber: number;

  @IsString()
  @IsOptional()
  toothType?: string;

  @IsIn(['presuntivo', 'definitivo'])
  diagnosisType: string;

  @IsIn([
    'sano', 'caries', 'restauracion', 'corona',
    'ausente', 'extraccion', 'endodoncia',
    'fractura', 'periodoncia', 'otro',
  ])
  toothCondition: string;

  @IsString()
  diagnosisDescription: string;

  @IsBoolean()
  @IsOptional()
  xrayRequested?: boolean;

  @IsUUID()
  @IsOptional()
  treatmentId?: string;

  @IsNumber()
  @IsOptional()
  customPrice?: number;

  @IsString()
  @IsOptional()
  notes?: string;
}

export class CreateOdontogramEntriesDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateOdontogramEntryDto)
  entries: CreateOdontogramEntryDto[];
}
