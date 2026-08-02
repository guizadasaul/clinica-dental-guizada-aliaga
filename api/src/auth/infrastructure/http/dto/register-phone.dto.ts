import { IsString, MinLength, MaxLength } from 'class-validator';

export class RegisterPhoneDto {
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  fullName: string;

  @IsString()
  @MaxLength(20)
  phone: string;

  @IsString()
  @MinLength(8)
  password: string;
}
