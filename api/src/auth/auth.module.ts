import { Module } from '@nestjs/common';
import { AuthController } from './infrastructure/http/auth.controller';
import { AuthService } from './application/auth.service';
import { UserRepository } from './domain/UserRepository';
import { AccessTokenVerifier } from './domain/AccessTokenVerifier';
import { PrismaUserRepository } from './infrastructure/persistence/prisma-user.repository';
import { SupabaseJwtVerifier } from './infrastructure/SupabaseJwtVerifier';
import { SupabaseAuthGuard } from './infrastructure/SupabaseAuthGuard';
import { SupabaseAdminService } from './infrastructure/SupabaseAdminService';
import { RolesGuard } from './infrastructure/RolesGuard';
import { PatientInvitesController } from '../patient-invites/infrastructure/http/patient-invites.controller';
import { PublicInviteStatusController } from '../patient-invites/infrastructure/http/public-invite-status.controller';
import { PatientInvitesService } from '../patient-invites/application/patient-invites.service';
import { PatientInviteRepository } from '../patient-invites/domain/PatientInviteRepository';
import { EmailSender } from '../patient-invites/domain/EmailSender';
import { PrismaPatientInviteRepository } from '../patient-invites/infrastructure/persistence/prisma-patient-invite.repository';
import { ResendEmailSender } from '../patient-invites/infrastructure/email/resend-email-sender';

/**
 * patient-invites (CLI-13) vive acá adentro a propósito, sin su propio
 * @Module(): AuthService necesita llamar a PatientInvitesService.redeem()
 * durante /auth/sync, y PatientInvitesController necesita estos mismos
 * guards — un @Module() separado crearía un ciclo real
 * (AuthModule → PatientInvitesModule → AuthModule). La estructura de
 * carpetas hexagonal se mantiene igual (api/src/patient-invites/...), solo
 * cambia dónde se registran sus providers/controllers en Nest.
 */
@Module({
  controllers: [
    AuthController,
    PatientInvitesController,
    PublicInviteStatusController,
  ],
  providers: [
    AuthService,
    SupabaseJwtVerifier,
    SupabaseAuthGuard,
    SupabaseAdminService,
    RolesGuard,
    { provide: UserRepository, useClass: PrismaUserRepository },
    { provide: AccessTokenVerifier, useExisting: SupabaseJwtVerifier },
    PatientInvitesService,
    {
      provide: PatientInviteRepository,
      useClass: PrismaPatientInviteRepository,
    },
    { provide: EmailSender, useClass: ResendEmailSender },
  ],
  exports: [
    SupabaseAuthGuard,
    RolesGuard,
    AccessTokenVerifier,
    UserRepository,
    SupabaseAdminService,
  ],
})
export class AuthModule {}
