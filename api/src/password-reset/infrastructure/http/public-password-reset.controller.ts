import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  PasswordResetService,
  ResetLinkStatusResult,
} from '../../application/password-reset.service.js';
import { readEnvInt } from '../../../shared/env.util.js';
import { ResetPasswordDto } from './dto/reset-password.dto.js';

const HOUR_MS = 3_600_000;

// Sin guard a propósito: lo usa alguien que no puede iniciar sesión. La
// autorización es el token del link (CLI-244). El status siempre responde
// 200, igual que el de las invitaciones.
@Controller('password-reset')
export class PublicPasswordResetController {
  constructor(private readonly passwordResetService: PasswordResetService) {}

  @Get(':token/status')
  status(@Param('token') token: string): Promise<ResetLinkStatusResult> {
    return this.passwordResetService.checkStatus(token);
  }

  @Post(':token')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({
    default: {
      limit: () => readEnvInt('THROTTLE_PASSWORD_RESET_PER_HOUR', 10),
      ttl: HOUR_MS,
    },
  })
  reset(
    @Param('token') token: string,
    @Body() dto: ResetPasswordDto,
  ): Promise<void> {
    return this.passwordResetService.resetPassword(token, dto.password);
  }
}
