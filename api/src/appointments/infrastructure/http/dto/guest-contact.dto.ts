import { Transform } from 'class-transformer';
import { IsEmail, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { EMAIL_RE } from '../../../../shared/validators/email.validator.js';
import { IsPersonName } from '../../../../shared/validators/full-name.validator.js';
import { EmptyToUndefined, NormalizeName } from '../../../../shared/validators/transforms.js';
import {
  E164_RE,
  IsE164Phone,
} from '../../../../shared/validators/phone.validator.js';

export class GuestContactDto {
  // Tres campos atómicos, espejo de CreatePatientDto (CLI-43) — antes era un
  // solo fullName que el backend partía a ciegas al confirmar el pago.
  @IsString()
  @NormalizeName()
  @IsPersonName()
  @MinLength(3)
  @MaxLength(100)
  firstName!: string;

  @IsString()
  @NormalizeName()
  @IsPersonName()
  @MinLength(3)
  @MaxLength(100)
  lastNamePaternal!: string;

  @IsOptional()
  @EmptyToUndefined()
  @IsString()
  @NormalizeName()
  @IsPersonName()
  @MinLength(3)
  @MaxLength(100)
  lastNameMaternal?: string;

  // Salida siempre en E.164 (la emite <app-phone-input> en el frontend).
  // @MaxLength(20) por la columna VARCHAR(20), no por el formato en sí.
  @IsString()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @Matches(E164_RE, { message: 'phone no tiene un formato válido' })
  @IsE164Phone()
  @MaxLength(20)
  phone!: string;

  // Opcional a propósito (decisión de CLI-22): se valida el formato solo si
  // no está vacío. @Matches(EMAIL_RE) además de @IsEmail() para que las dos
  // reglas sean literalmente la misma y no puedan divergir entre sí.
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail(undefined, { message: 'email no tiene un formato válido' })
  @Matches(EMAIL_RE, { message: 'email no tiene un formato válido' })
  @MaxLength(255)
  email?: string;
}
