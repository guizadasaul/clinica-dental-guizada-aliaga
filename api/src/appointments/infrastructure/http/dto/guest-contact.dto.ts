import { IsEmail, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class GuestContactDto {
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  fullName!: string;

  @IsString()
  @MaxLength(20)
  @Matches(/^[0-9+\s-]{7,20}$/, { message: 'phone no tiene un formato válido' })
  phone!: string;

  @IsOptional()
  @IsEmail(undefined, { message: 'email no tiene un formato válido' })
  @MaxLength(255)
  email?: string;
}
