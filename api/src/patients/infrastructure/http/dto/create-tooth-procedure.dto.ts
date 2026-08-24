import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
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
  ValidateNested,
} from 'class-validator';
import {
  EmptyToUndefined,
  Trim,
} from '../../../../shared/validators/transforms.js';
import { NoHtml } from '../../../../shared/validators/text-safety.validator.js';

// Boca completa permanente (32 piezas) — tope teórico de una sola aplicación.
const MAX_TEETH_PER_APPLICATION = 32;

/**
 * Un diente dentro de una aplicación, con SUS PROPIAS superficies (CLI-41)
 * — antes las 5 superficies eran un único juego para toda la aplicación y
 * se copiaban igual a cada diente del grupo, lo cual no es clínicamente
 * correcto para un tratamiento de multiple_teeth (p. ej. curetaje: cada
 * pieza puede tener caras afectadas distintas).
 *
 * Sin @IsFdiToothNumber() a propósito, igual que el DTO anterior — sigue
 * validando solo con @Min(11)/@Max(85), fuera de alcance de este cambio.
 */
export class ToothApplicationDto {
  @IsInt()
  @Min(11)
  @Max(85)
  number!: number;

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
}

export class CreateToothProcedureDto {
  /**
   * Vacío para tratamientos de arcada/boca completa o sin diente (el
   * applicationType del tratamiento decide si acepta 0, 1 o 2+ — no se
   * valida acá, ver assertTeethMatchApplicationType en patients.service.ts).
   */
  @IsArray()
  @ArrayMaxSize(MAX_TEETH_PER_APPLICATION)
  @ValidateNested({ each: true })
  @Type(() => ToothApplicationDto)
  teeth!: ToothApplicationDto[];

  @IsUUID()
  treatmentId!: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  priceCharged!: number;

  /** Para aplicaciones por unidad/caja (elásticos, cera ortodóntica) — ver TreatmentApplicationType.typeAllowsQuantity(). 1 si no se envía. */
  @IsOptional()
  @IsInt()
  @Min(1)
  quantity?: number;

  @IsOptional()
  @IsDateString()
  procedureDate?: string;

  @IsOptional()
  @EmptyToUndefined()
  @Trim()
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  @NoHtml()
  notes?: string;
}
