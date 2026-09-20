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
  ValidateIf,
  ValidateNested,
  ValidationArguments,
} from 'class-validator';
import {
  EmptyToUndefined,
  Trim,
} from '../../../../shared/validators/transforms.js';
import { PersonNamePart } from '../../../../shared/validators/person-name-part.validator.js';
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
  @PersonNamePart()
  firstName: string;

  @PersonNamePart()
  lastNamePaternal: string;

  @IsOptional()
  @EmptyToUndefined()
  @PersonNamePart()
  lastNameMaternal?: string;

  // Alcanza con UN contacto (CLI-77): la invitación se manda por email o por
  // WhatsApp, y cuál de los dos usar se elige después de crear. El email solo
  // se exige cuando no vino teléfono (o si vino, para validarlo).
  @ValidateIf(
    (dto: CreateDoctorDto) =>
      dto.phone === undefined || dto.email !== undefined,
  )
  @EmptyToUndefined()
  @Trim()
  @IsEmail(
    {},
    {
      message: (args: ValidationArguments) =>
        args.value === undefined
          ? 'Ingresá al menos un contacto: email o teléfono'
          : 'email must be an email',
    },
  )
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
