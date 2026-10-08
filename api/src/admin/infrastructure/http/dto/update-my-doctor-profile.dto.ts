import { Type } from 'class-transformer';
import {
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import {
  EmptyToUndefined,
  NormalizeName,
  NormalizeText,
} from '../../../../shared/validators/transforms.js';
import { PersonNamePart } from '../../../../shared/validators/person-name-part.validator.js';
import { IsE164Phone } from '../../../../shared/validators/phone.validator.js';
import { HEX_COLOR_REGEX } from '../../../../shared/doctor-color-palette.js';
import { NoHtml } from '../../../../shared/validators/text-safety.validator.js';
import { IsValidSchedule, ScheduleBlockDto } from './schedule-block.dto.js';
import { NoUndecidedTitle } from '../../../../shared/validators/public-name.validator.js';

/**
 * Lo que un doctor puede editar de su propio perfil (CLI-191). A diferencia de
 * UpdateDoctorDto (del administrador) no incluye el correo (es su identidad de
 * acceso), si es reservable, el orden ni la foto.
 */
export class UpdateMyDoctorProfileDto {
  /** Nombre público: el que ve el paciente al reservar. */
  @IsOptional()
  @EmptyToUndefined()
  @NormalizeName()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  @NoHtml()
  @NoUndecidedTitle()
  displayName?: string;

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
  @EmptyToUndefined()
  @IsE164Phone()
  @MaxLength(20)
  phone?: string;

  @IsOptional()
  @EmptyToUndefined()
  @NormalizeName()
  @IsString()
  @MaxLength(150)
  @NoHtml()
  specialty?: string;

  @IsOptional()
  @EmptyToUndefined()
  @NormalizeText()
  @IsString()
  @MaxLength(2000)
  @NoHtml()
  bio?: string;

  /** Color en la agenda común, "#rrggbb". */
  @IsOptional()
  @Matches(HEX_COLOR_REGEX, { message: 'color debe tener el formato #rrggbb' })
  color?: string;

  @IsOptional()
  @IsArray()
  @IsValidSchedule()
  @ValidateNested({ each: true })
  @Type(() => ScheduleBlockDto)
  scheduleBlocks?: ScheduleBlockDto[];
}
