import { IsString, MinLength, MaxLength } from 'class-validator';

export class RegisterPhoneDto {
  @IsString()
  @MinLength(6)
  @MaxLength(20)
  phone!: string;

  @IsString()
  @MinLength(6)
  @MaxLength(72)
  password!: string;
}
