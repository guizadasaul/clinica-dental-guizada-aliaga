import { Type } from 'class-transformer';
import {
  IsArray,
  IsEmail,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import {
  EmptyToUndefined,
  NormalizeName,
  Trim,
} from '../../../../shared/validators/transforms.js';
import { IsPersonName } from '../../../../shared/validators/full-name.validator.js';
import { IsE164Phone } from '../../../../shared/validators/phone.validator.js';
import { NoHtml } from '../../../../shared/validators/text-safety.validator.js';
import { ScheduleBlockDto } from './schedule-block.dto.js';

export class CreateDoctorDto {
  // Nombre público (con "Dr./Dra."): lo que ve el paciente al reservar.
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  @NoHtml()
  displayName: string;

  // Nombre y apellidos reales (CLI-76) — mismas reglas que en pacientes
  // (CreatePatientDto): normalizados y con IsPersonName, que ya rechaza HTML.
  @IsString()
  @NormalizeName()
  @IsPersonName()
  @MinLength(3)
  @MaxLength(100)
  firstName: string;

  @IsString()
  @NormalizeName()
  @IsPersonName()
  @MinLength(3)
  @MaxLength(100)
  lastNamePaternal: string;

  @IsOptional()
  @EmptyToUndefined()
  @IsString()
  @NormalizeName()
  @IsPersonName()
  @MinLength(3)
  @MaxLength(100)
  lastNameMaternal?: string;

  // Obligatorio (a diferencia del resto de campos opcionales): hace falta
  // para poder mandarle la invitación por email al doctor nuevo.
  @Trim()
  @IsEmail()
  @MaxLength(255)
  email: string;

  @IsOptional()
  @EmptyToUndefined()
  @Trim()
  @IsE164Phone()
  @MaxLength(20)
  phone?: string;

  @IsOptional()
  @EmptyToUndefined()
  @Trim()
  @IsString()
  @MaxLength(150)
  @NoHtml()
  specialty?: string;

  @IsOptional()
  @EmptyToUndefined()
  @Trim()
  @IsString()
  @NoHtml()
  bio?: string;

  // URL plana, sin pipeline de upload propio — fuera de alcance de CLI-63.
  @IsOptional()
  @EmptyToUndefined()
  @Trim()
  @IsUrl()
  @MaxLength(2048)
  photoUrl?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  displayOrder?: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ScheduleBlockDto)
  scheduleBlocks: ScheduleBlockDto[];
}
