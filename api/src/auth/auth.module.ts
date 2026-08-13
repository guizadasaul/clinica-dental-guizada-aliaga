import { Module } from '@nestjs/common';
import { AuthController } from './infrastructure/http/auth.controller';
import { AuthService } from './application/auth.service';
import { UserRepository } from './domain/UserRepository';
import { AccessTokenVerifier } from './domain/AccessTokenVerifier';
import { PrismaUserRepository } from './infrastructure/persistence/prisma-user.repository';
import { SupabaseJwtVerifier } from './infrastructure/SupabaseJwtVerifier';
import { SupabaseAuthGuard } from './infrastructure/SupabaseAuthGuard';
import { RolesGuard } from './infrastructure/RolesGuard';

@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    SupabaseJwtVerifier,
    SupabaseAuthGuard,
    RolesGuard,
    { provide: UserRepository, useClass: PrismaUserRepository },
    { provide: AccessTokenVerifier, useExisting: SupabaseJwtVerifier },
  ],
  exports: [SupabaseAuthGuard, RolesGuard, AccessTokenVerifier, UserRepository],
})
export class AuthModule {}
