import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from '../../application/auth.service.js';
import { readEnvInt } from '../../../shared/env.util.js';
import { RegisterPhoneDto } from './dto/register-phone.dto.js';

const HOUR_MS = 3_600_000;

// Sin guard a propósito: lo llama alguien que todavía no tiene sesión, para
// crearse una cuenta nueva por teléfono+contraseña (CLI-27). La autorización
// es el token de invitación del DTO, que AuthService verifica antes de crear
// nada.
@Controller('auth')
export class PublicPhoneRegistrationController {
  constructor(private readonly authService: AuthService) {}

  @Post('register/phone')
  @HttpCode(HttpStatus.CREATED)
  // 5/hora por IP (CLI-36).
  @Throttle({
    default: {
      limit: () => readEnvInt('THROTTLE_REGISTER_PHONE_PER_HOUR', 5),
      ttl: HOUR_MS,
    },
  })
  register(@Body() dto: RegisterPhoneDto): Promise<void> {
    return this.authService.registerWithPhone(
      dto.phone,
      dto.password,
      dto.inviteToken,
    );
  }
}
