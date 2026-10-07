import { IsString, MaxLength, MinLength } from 'class-validator';

/** Mismo largo que el alta (CLI-242): 8 a 72 caracteres. */
export class ResetPasswordDto {
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password!: string;
}
