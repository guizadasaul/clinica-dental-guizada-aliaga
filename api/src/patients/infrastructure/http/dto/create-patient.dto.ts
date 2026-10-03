import {
  IsDateString,
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import {
  EmptyToUndefined,
  NormalizeDni,
  NormalizeEmail,
  NormalizeName,
  Trim,
} from '../../../../shared/validators/transforms.js';
import { IsPersonName } from '../../../../shared/validators/full-name.validator.js';
import { IsDni } from '../../../../shared/validators/dni.validator.js';
import { IsE164Phone } from '../../../../shared/validators/phone.validator.js';
import { NoHtml } from '../../../../shared/validators/text-safety.validator.js';
import {
  IsAgeWithin,
  IsNotBefore,
  IsNotFutureDate,
} from '../../../../shared/validators/date.validator.js';
import {
  SEXES,
  DOCUMENT_TYPES,
} from '../../../../shared/validators/clinical-options.js';

export class CreatePatientDto {
  @IsOptional()
  @IsUUID()
  userId?: string;

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

  // No puede ser futura ni corresponder a una edad fuera de 0-120 años.
  @IsDateString()
  @IsNotFutureDate()
  @IsAgeWithin(0, 120)
  birthDate: string;

  // Obligatorio (antes opcional) — pedido explícito: la ficha del paciente
  // no queda completa sin lugar de nacimiento, sexo, ocupación, DNI,
  // dirección ni contacto de emergencia.
  @EmptyToUndefined()
  // CLI-178: mayúscula inicial por palabra; el servicio además reusa el
  // valor ya guardado si coincide sin importar mayúsculas ni tildes.
  @NormalizeName()
  @IsString()
  @IsNotEmpty({ message: 'birthPlace es obligatorio' })
  @MinLength(3)
  @MaxLength(150)
  @NoHtml()
  birthPlace: string;

  // El <select> ya usa códigos ASCII estables — no cambian, solo se cierran.
  @EmptyToUndefined()
  @Trim()
  @IsNotEmpty({ message: 'sex es obligatorio' })
  @IsIn(SEXES)
  sex: string;

  @EmptyToUndefined()
  @Trim()
  @IsString()
  @IsNotEmpty({ message: 'occupation es obligatorio' })
  @MinLength(3)
  @MaxLength(150)
  @NoHtml()
  occupation: string;

  // MaxLength(300) es nuevo — antes era TEXT sin límite ni en el DTO ni en
  // Postgres. Resto de la dirección (calle, número, referencias) — zona y
  // ciudad son campos propios (CLI-54), ver abajo.
  @EmptyToUndefined()
  @Trim()
  @IsString()
  @IsNotEmpty({ message: 'address es obligatorio' })
  @MinLength(3)
  @MaxLength(300)
  @NoHtml()
  address: string;

  // CLI-54: separado de address para poder reportar por zona sin parsear
  // texto libre.
  @EmptyToUndefined()
  // CLI-178: mayúscula inicial por palabra; el servicio además reusa el
  // valor ya guardado si coincide sin importar mayúsculas ni tildes.
  @NormalizeName()
  @IsString()
  @IsNotEmpty({ message: 'zona es obligatorio' })
  @MinLength(2)
  @MaxLength(100)
  @NoHtml()
  zona: string;

  @EmptyToUndefined()
  // CLI-178: mayúscula inicial por palabra; el servicio además reusa el
  // valor ya guardado si coincide sin importar mayúsculas ni tildes.
  @NormalizeName()
  @IsString()
  @IsNotEmpty({ message: 'ciudad es obligatorio' })
  @MinLength(2)
  @MaxLength(100)
  @NoHtml()
  ciudad: string;

  // Salida siempre en E.164 (la emite <app-phone-input> en el frontend).
  // @MaxLength(20) por la columna VARCHAR(20), no por el formato en sí.
  // El teléfono del PACIENTE (a diferencia del de emergencia) sigue opcional
  // por sí solo: desde CLI-181 se exige al menos uno de teléfono o correo, y
  // esa regla vive en PatientsService (también cuenta lo que el usuario ya
  // tenga guardado).
  @IsOptional()
  @EmptyToUndefined()
  @Trim()
  @IsE164Phone()
  @MaxLength(20)
  phone?: string;

  /** Correo de contacto (CLI-181): se guarda en users.email. */
  @IsOptional()
  @EmptyToUndefined()
  @NormalizeEmail()
  @IsEmail({}, { message: 'El correo electrónico no es válido.' })
  @MaxLength(255)
  email?: string;

  // Obligatorio: el contacto de emergencia completo (nombres, apellidos,
  // teléfono, parentesco) pasa a exigirse junto con los demás campos de la
  // ficha. Mismas reglas que el nombre y el apellido del propio paciente.
  @EmptyToUndefined()
  @IsString()
  @NormalizeName()
  @IsPersonName()
  @MinLength(3)
  @MaxLength(100)
  emergencyContactFirstName: string;

  @EmptyToUndefined()
  @IsString()
  @NormalizeName()
  @IsPersonName()
  @MinLength(3)
  @MaxLength(100)
  emergencyContactLastName: string;

  @EmptyToUndefined()
  @Trim()
  @IsNotEmpty({ message: 'emergencyContactPhone es obligatorio' })
  @IsE164Phone()
  @MaxLength(20)
  emergencyContactPhone: string;

  @EmptyToUndefined()
  @Trim()
  @IsString()
  @IsNotEmpty({ message: 'emergencyContactRelationship es obligatorio' })
  @MinLength(3)
  @MaxLength(100)
  @NoHtml()
  emergencyContactRelationship: string;

  // MaxLength(1000) es nuevo. Sigue opcional — no estaba en la lista de
  // campos obligatorios — pero si viene con contenido exige un mínimo de 3
  // caracteres, igual que el resto del texto libre del wizard.
  @IsOptional()
  @EmptyToUndefined()
  @Trim()
  @IsString()
  @MinLength(3)
  @MaxLength(1000)
  @NoHtml()
  consultationReason?: string;

  // No puede ser futura ni anterior al nacimiento del paciente.
  @IsOptional()
  @EmptyToUndefined()
  @IsDateString()
  @IsNotFutureDate()
  @IsNotBefore('birthDate')
  lastDentistVisit?: string;

  // MaxLength(500) es nuevo.
  @IsOptional()
  @EmptyToUndefined()
  @Trim()
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  @NoHtml()
  lastVisitTreatment?: string;

  // MaxLength(1000) es nuevo.
  @IsOptional()
  @EmptyToUndefined()
  @Trim()
  @IsString()
  @MinLength(3)
  @MaxLength(1000)
  @NoHtml()
  familyHistory?: string;

  // CLI-54: (documentType, dni) es el par único real — un pasaporte y una
  // CI pueden coincidir en número sin ser la misma persona.
  @EmptyToUndefined()
  @Trim()
  @IsNotEmpty({ message: 'documentType es obligatorio' })
  @IsIn(DOCUMENT_TYPES)
  documentType: string;

  // Número de CI, NIT o pasaporte (CLI-177): (documentType, dni) es único en
  // la base. Se recortan los bordes y se pasa a mayúsculas; el resto lo
  // valida IsDni (5 a 12 caracteres, letras, números y guiones, sin espacios
  // ni puntos). La extensión de la CI va dentro con guion (1234567-LP).
  @EmptyToUndefined()
  @NormalizeDni()
  @IsNotEmpty({ message: 'El número de documento es obligatorio' })
  @IsDni()
  dni: string;
}
