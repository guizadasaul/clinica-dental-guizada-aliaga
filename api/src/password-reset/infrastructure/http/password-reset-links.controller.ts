import {
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  CreateResetLinkResult,
  PasswordResetService,
} from '../../application/password-reset.service.js';
import { SupabaseAuthGuard } from '../../../auth/infrastructure/SupabaseAuthGuard.js';
import { RolesGuard } from '../../../auth/infrastructure/RolesGuard.js';
import { Roles } from '../../../auth/infrastructure/roles.decorator.js';
import { UserRole } from '../../../auth/domain/value-objects/UserRole.js';

/** El doctor arma desde la ficha el link de contraseña nueva (CLI-244). */
@Controller('patients')
@UseGuards(SupabaseAuthGuard, RolesGuard)
export class PasswordResetLinksController {
  constructor(private readonly passwordResetService: PasswordResetService) {}

  @Post(':id/password-reset-links')
  @Roles(UserRole.ODONTOLOGIST)
  @HttpCode(HttpStatus.CREATED)
  create(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<CreateResetLinkResult> {
    return this.passwordResetService.createLink(id);
  }
}
