import { IsString, Matches, MaxLength, MinLength } from 'class-validator';
import {
  E164_RE,
  IsE164Phone,
} from '../../../../shared/validators/phone.validator.js';

export class RegisterPhoneDto {
  // Seguro: el único llamador (invitation-landing.ts) ya manda
  // normalizePhone(identifier), o sea E.164 — este @Matches + @IsE164Phone
  // reemplaza el @MinLength(6) que tenía antes este campo, que no validaba
  // formato en absoluto.
  @IsString()
  @Matches(E164_RE, { message: 'phone no tiene un formato válido' })
  @IsE164Phone()
  @MaxLength(20)
  phone!: string;

  // 8 caracteres mínimo (antes 6, CLI-36) — sin regla de complejidad. Solo
  // afecta altas nuevas, el login de una cuenta existente no revalida el
  // largo. Paso manual fuera del código: subir el mínimo también en
  // Supabase (Auth → Policies → Minimum password length) para que las dos
  // puntas coincidan.
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password!: string;

  // Solo se crea una cuenta con el link de invitación del odontólogo: sin un
  // token vigente, el registro se rechaza antes de tocar Supabase Auth (así
  // el endpoint tampoco sirve para averiguar qué teléfonos ya existen).
  // Mismo límite de largo que SyncUserDto.inviteToken.
  @IsString()
  @MaxLength(400)
  inviteToken!: string;
}
