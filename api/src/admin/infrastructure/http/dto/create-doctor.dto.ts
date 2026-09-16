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
  ValidateNested,
} from 'class-validator';
import {
  EmptyToUndefined,
  Trim,
} from '../../../../shared/validators/transforms.js';
import { IsE164Phone } from '../../../../shared/validators/phone.validator.js';
import { NoHtml } from '../../../../shared/validators/text-safety.validator.js';
import { ScheduleBlockDto } from './schedule-block.dto.js';

export class CreateDoctorDto {
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  @NoHtml()
  displayName: string;

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
