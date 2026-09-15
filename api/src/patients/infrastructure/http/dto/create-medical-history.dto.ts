import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsDateString,
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
import { IsNotFutureDate } from '../../../../shared/validators/date.validator.js';

// Generoso a propósito, no hay un tope clínico real (igual criterio que
// MAX_FINDINGS en create-dental-exam.dto.ts).
const MAX_CONDITIONS = 50;
const MAX_MEDICATIONS = 50;

/**
 * Una condición del historial, con SU código de catálogo (CLI-50) — que el
 * código exista se valida en el service contra medical_conditions
 * (mismo patrón que diagnosisCode en create-dental-exam.dto.ts), acá solo
 * se valida forma.
 */
export class MedicalConditionEntryDto {
  @IsString()
  @Trim()
  @Length(1, 50)
  code: string;

  @IsOptional()
  @IsDateString()
  @IsNotFutureDate()
  diagnosedAt?: string;

  @IsOptional()
  @EmptyToUndefined()
  @Trim()
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  @NoHtml()
  notes?: string;
}

/** Un fármaco que el paciente toma actualmente (CLI-50) — reemplaza el texto libre currentMedications. */
export class PatientMedicationDto {
  @Trim()
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  @NoHtml()
  drugName: string;

  @IsOptional()
  @EmptyToUndefined()
  @Trim()
  @IsString()
  @MaxLength(50)
  @NoHtml()
  dose?: string;

  @IsOptional()
  @EmptyToUndefined()
  @Trim()
  @IsString()
  @MaxLength(100)
  @NoHtml()
  frequency?: string;

  @IsOptional()
  @IsDateString()
  @IsNotFutureDate()
  startedAt?: string;
}

export class CreateMedicalHistoryDto {
  // Vacío es válido: un historial sin condiciones registradas es un dato
  // real (el paciente no tiene ninguna), no un historial sin registrar.
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_CONDITIONS)
  @ArrayUnique((entry: MedicalConditionEntryDto) => entry.code)
  @ValidateNested({ each: true })
  @Type(() => MedicalConditionEntryDto)
  conditions?: MedicalConditionEntryDto[];

  @IsOptional()
  @EmptyToUndefined()
  @Trim()
  @IsString()
  @MinLength(3)
  @MaxLength(1000)
  @NoHtml()
  otherDiseases?: string;

  @IsOptional()
  @IsDateString()
  @IsNotFutureDate()
  gestationLmpDate?: string;

  // Tri-estado (Sí / No / No sabe): boolean nullable a propósito, sin
  // default. @IsOptional() deja pasar tanto `undefined` como `null`.
  @IsOptional()
  @IsBoolean()
  anesthesiaReactions?: boolean | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_MEDICATIONS)
  @ValidateNested({ each: true })
  @Type(() => PatientMedicationDto)
  medications?: PatientMedicationDto[];
}
