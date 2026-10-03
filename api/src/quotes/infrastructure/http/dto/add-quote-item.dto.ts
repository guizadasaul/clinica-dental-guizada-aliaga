import {
  IsArray,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsUUID,
  Min,
} from 'class-validator';
import { IsFdiToothNumber } from '../../../../shared/validators/tooth.validator.js';

export class AddQuoteItemDto {
  @IsUUID()
  treatmentId!: string;

  /** Vacío para arcada/boca completa o sin diente — el applicationType del tratamiento decide, ver assertTeethMatchApplicationType en quotes.service.ts. */
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  @IsFdiToothNumber({ each: true })
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
