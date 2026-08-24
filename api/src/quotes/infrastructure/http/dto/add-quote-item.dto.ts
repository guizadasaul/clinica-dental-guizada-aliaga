import {
  IsArray,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

export class AddQuoteItemDto {
  @IsUUID()
  treatmentId!: string;

  /** Vacío para arcada/boca completa o sin diente — el applicationType del tratamiento decide, ver assertTeethMatchApplicationType en quotes.service.ts. */
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  @Min(11, { each: true })
  @Max(85, { each: true })
  toothNumbers?: number[];

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  customPrice?: number;

  /** Solo válido para tratamientos sin dientes ni arcadas, vendidos por unidad (elásticos, cera) — ver quotes.service.ts. */
  @IsOptional()
  @IsInt()
  @Min(1)
  quantity?: number;
}
