import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { AuthService } from '../../application/auth.service.js';
import { RegisterPhoneDto } from './dto/register-phone.dto.js';

// Sin guard a propósito: lo llama alguien que todavía no tiene sesión, para
// crearse una cuenta nueva por teléfono+contraseña (CLI-27) — análogo al
// signUp por email, que también es alcanzable sin sesión previa.
@Controller('auth')
export class PublicPhoneRegistrationController {
  constructor(private readonly authService: AuthService) {}

  @Post('register/phone')
  @HttpCode(HttpStatus.CREATED)
  register(@Body() dto: RegisterPhoneDto): Promise<void> {
    return this.authService.registerWithPhone(dto.phone, dto.password);
  }
}
