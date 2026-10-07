import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from '../../application/auth.service.js';
import { readEnvInt } from '../../../shared/env.util.js';
import {
  RecoverPasswordDto,
  RegisterEmailDto,
  ResendConfirmationDto,
} from './dto/register-email.dto.js';

const HOUR_MS = 3_600_000;

// Sin guard a propósito, igual que el alta por teléfono: lo llama alguien
// sin sesión. La autorización del alta es el token de invitación del DTO.
@Controller('auth')
export class PublicEmailRegistrationController {
  constructor(private readonly authService: AuthService) {}

  /** Alta por correo + contraseña (CLI-242). Manda el correo de confirmación. */
  @Post('register/email')
  @HttpCode(HttpStatus.CREATED)
  @Throttle({
    default: {
      limit: () => readEnvInt('THROTTLE_REGISTER_EMAIL_PER_HOUR', 5),
      ttl: HOUR_MS,
    },
  })
  register(@Body() dto: RegisterEmailDto): Promise<void> {
    return this.authService.registerWithEmail(
      dto.email,
      dto.password,
      dto.inviteToken,
    );
  }

  /** Siempre 204: no revela si el correo tiene una cuenta pendiente. */
  @Post('register/email/resend')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({
    default: {
      limit: () => readEnvInt('THROTTLE_REGISTER_EMAIL_PER_HOUR', 5),
      ttl: HOUR_MS,
    },
  })
  resend(@Body() dto: ResendConfirmationDto): Promise<void> {
    return this.authService.resendEmailConfirmation(dto.email);
  }

  /** "Olvidé mi contraseña" (CLI-243). Siempre 204: no revela si el correo existe. */
  @Post('password/recover')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({
    default: {
      limit: () => readEnvInt('THROTTLE_PASSWORD_RECOVER_PER_HOUR', 5),
      ttl: HOUR_MS,
    },
  })
  recover(@Body() dto: RecoverPasswordDto): Promise<void> {
    return this.authService.requestPasswordRecovery(dto.email);
  }
}
