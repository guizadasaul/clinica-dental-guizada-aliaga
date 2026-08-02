import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { AuthService } from '../../application/auth.service.js';
import { RegisterPhoneDto } from './dto/register-phone.dto.js';
import { LoginPhoneDto } from './dto/login-phone.dto.js';

@Controller('auth/phone')
export class PhoneAuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  async register(@Body() dto: RegisterPhoneDto): Promise<{ customToken: string }> {
    const customToken = await this.authService.registerWithPhone(dto.fullName, dto.phone, dto.password);
    return { customToken };
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginPhoneDto): Promise<{ customToken: string }> {
    const customToken = await this.authService.loginWithPhone(dto.phone, dto.password);
    return { customToken };
  }
}
