import {
  IsDateString,
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
  @Trim()
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
  @Trim()
  @IsString()
  @IsNotEmpty({ message: 'zona es obligatorio' })
  @MinLength(2)
  @MaxLength(100)
  @NoHtml()
  zona: string;

  @EmptyToUndefined()
  @Trim()
  @IsString()
  @IsNotEmpty({ message: 'ciudad es obligatorio' })
  @MinLength(2)
  @MaxLength(100)
  @NoHtml()
  ciudad: string;

  // Salida siempre en E.164 (la emite <app-phone-input> en el frontend).
  // @MaxLength(20) por la columna VARCHAR(20), no por el formato en sí.
  // El teléfono del PACIENTE (a diferencia del de emergencia) sigue opcional
  // — no estaba en la lista de campos que pasan a obligatorios.
  @IsOptional()
  @EmptyToUndefined()
  @Trim()
  @IsE164Phone()
  @MaxLength(20)
  phone?: string;

  // Obligatorio: el contacto de emergencia completo (nombre, teléfono,
  // parentesco) pasa a exigirse junto con los demás campos de la ficha.
  @EmptyToUndefined()
  @IsString()
  @NormalizeName()
  @IsPersonName()
  @MinLength(3)
  @MaxLength(200)
  emergencyContactName: string;

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

  // dni + documentType son @@unique en la base — normalizado (mayúsculas,
  // sin puntos ni espacios ni guiones) para que "12.345.678" y "12345678"
  // no convivan como pacientes distintos. Obligatorio (antes opcional);
  // DNI_RE ya exige 5-15 caracteres, por encima del mínimo de 3 del resto
  // del texto libre.
  @EmptyToUndefined()
  @NormalizeDni()
  @IsNotEmpty({ message: 'dni es obligatorio' })
  @IsDni()
  @MaxLength(20)
  dni: string;
}
