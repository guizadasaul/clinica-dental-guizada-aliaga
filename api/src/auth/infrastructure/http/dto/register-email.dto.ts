import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { EMAIL_RE } from '../../../../shared/validators/email.validator.js';

const normalizeEmail = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

/**
 * Alta por correo + contraseña (CLI-242). Mismas reglas que el alta por
 * teléfono: contraseña de 8 a 72 caracteres y solo con una invitación
 * vigente. A diferencia de antes (signUp desde el navegador), acá sí se valida
 * el largo de la contraseña del lado del servidor.
 */
export class RegisterEmailDto {
  @Transform(normalizeEmail)
  @IsEmail(undefined, { message: 'email no tiene un formato válido' })
  @Matches(EMAIL_RE, { message: 'email no tiene un formato válido' })
  @MaxLength(255)
  email!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password!: string;

  @IsString()
  @MaxLength(400)
  inviteToken!: string;
}

/** Reenvío del correo de confirmación (CLI-242). */
export class ResendConfirmationDto {
  @Transform(normalizeEmail)
  @IsEmail(undefined, { message: 'email no tiene un formato válido' })
  @Matches(EMAIL_RE, { message: 'email no tiene un formato válido' })
  @MaxLength(255)
  email!: string;
}
