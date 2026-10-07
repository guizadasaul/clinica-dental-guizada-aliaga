import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PasswordResetService } from './application/password-reset.service';
import { PasswordResetLinkRepository } from './domain/PasswordResetLinkRepository';
import { PasswordResetLinksController } from './infrastructure/http/password-reset-links.controller';
import { PublicPasswordResetController } from './infrastructure/http/public-password-reset.controller';
import { PrismaPasswordResetLinkRepository } from './infrastructure/persistence/prisma-password-reset-link.repository';

/** Links de contraseña nueva por WhatsApp para cuentas sin correo (CLI-244). */
@Module({
  imports: [AuthModule],
  controllers: [PasswordResetLinksController, PublicPasswordResetController],
  providers: [
    PasswordResetService,
    {
      provide: PasswordResetLinkRepository,
      useClass: PrismaPasswordResetLinkRepository,
    },
  ],
})
export class PasswordResetModule {}
