import { IsString } from 'class-validator';

export class LoginPhoneDto {
  @IsString()
  phone: string;

  @IsString()
  password: string;
}
