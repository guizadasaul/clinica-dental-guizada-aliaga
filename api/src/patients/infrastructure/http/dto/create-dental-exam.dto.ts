import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import {
  EmptyToUndefined,
  Trim,
} from '../../../../shared/validators/transforms.js';
import { NoHtml } from '../../../../shared/validators/text-safety.validator.js';
import { IsFdiToothNumber } from '../../../../shared/validators/tooth.validator.js';
import {
  BLACK_CLASSES,
  MOBILITY_GRADES,
} from '../../../../shared/validators/clinical-options.js';

// Alcance máximo teórico de un hallazgo multiple_teeth: la boca completa
// (32 piezas permanentes). single_tooth/general se validan contra el
// catálogo en el service (ahí sí se conoce el scope del diagnóstico).
import {
  DENTAL_EXAM_KINDS,
  type DentalExamKind,
} from '../../../domain/DentalExam.js';

const MAX_TEETH_PER_FINDING = 32;

// Un examen puede tener varios hallazgos por diente y varios generales —
// generoso a propósito, no hay un tope clínico real.
const MAX_FINDINGS = 100;

const MODIFIER_VALUES = [...BLACK_CLASSES, ...MOBILITY_GRADES];

export class CreateDentalExamFindingDto {
  @IsString()
  @Trim()
  @Length(1, 50)
  diagnosisCode: string;

  /**
   * Vacío para diagnósticos `general`. El service valida que la cantidad
   * coincida con el scope del diagnóstico (1 para single_tooth, 1+ para
   * multiple_teeth) — acá solo se valida forma.
   */
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_TEETH_PER_FINDING)
  @ArrayUnique()
  @IsInt({ each: true })
  @IsFdiToothNumber({ each: true })
  toothNumbers?: number[];

  @IsOptional()
  @IsString()
  @IsIn(MODIFIER_VALUES)
  modifierValue?: string;

  @IsOptional()
  @EmptyToUndefined()
  @Trim()
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  @NoHtml()
  description?: string;

  @IsOptional()
  @IsBoolean()
  xrayRequested?: boolean;

  @IsOptional()
  @EmptyToUndefined()
  @Trim()
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  @NoHtml()
  notes?: string;
}

export class CreateDentalExamDto {
  // Vacío es válido: un examen sin hallazgos es "boca sana", no un examen
  // sin registrar — sigue quedando la versión con su autor y fecha.
  @IsArray()
  @ArrayMaxSize(MAX_FINDINGS)
  @ValidateNested({ each: true })
  @Type(() => CreateDentalExamFindingDto)
  findings: CreateDentalExamFindingDto[];

  // CLI-109: un diagnóstico nuevo (paciente que vuelve) vs. la corrección del
  // vigente. Opcional — sin valor, el repo decide según haya versiones previas.
  @IsOptional()
  @IsIn(DENTAL_EXAM_KINDS)
  kind?: DentalExamKind;

  // Requerido por la UI (no acá) cuando ya existe una versión previa del
  // examen — el primer guardado de un paciente no tiene nada que explicar.
  @IsOptional()
  @EmptyToUndefined()
  @Trim()
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  @NoHtml()
  changeReason?: string;

  @IsOptional()
  @EmptyToUndefined()
  @Trim()
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  @NoHtml()
  notes?: string;
}
