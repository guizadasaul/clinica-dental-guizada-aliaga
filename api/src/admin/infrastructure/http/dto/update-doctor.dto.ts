import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
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
import { PersonNamePart } from '../../../../shared/validators/person-name-part.validator.js';
import { IsE164Phone } from '../../../../shared/validators/phone.validator.js';
import { NoHtml } from '../../../../shared/validators/text-safety.validator.js';
import { ScheduleBlockDto } from './schedule-block.dto.js';

export class UpdateDoctorDto {
  @IsOptional()
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  @NoHtml()
  displayName?: string;

  // Todos opcionales en el PATCH: un doctor cargado antes de CLI-76 no tiene
  // nombre/apellidos y se tiene que poder seguir editando sin completarlos.
  @IsOptional()
  @EmptyToUndefined()
  @PersonNamePart()
  firstName?: string;

  @IsOptional()
  @EmptyToUndefined()
  @PersonNamePart()
  lastNamePaternal?: string;

  @IsOptional()
  @EmptyToUndefined()
  @PersonNamePart()
  lastNameMaternal?: string;

  @IsOptional()
  @Trim()
  @IsEmail()
  @MaxLength(255)
  email?: string;

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

  @IsOptional()
  @IsBoolean()
  isBookable?: boolean;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ScheduleBlockDto)
  scheduleBlocks?: ScheduleBlockDto[];
}
