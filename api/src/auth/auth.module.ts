import { Module } from '@nestjs/common';
import { AuthController } from './infrastructure/http/auth.controller';
import { AuthService } from './application/auth.service';
import { UserRepository } from './domain/UserRepository';
import { AccessTokenVerifier } from './domain/AccessTokenVerifier';
import { PrismaUserRepository } from './infrastructure/persistence/prisma-user.repository';
import { SupabaseJwtVerifier } from './infrastructure/SupabaseJwtVerifier';
import { SupabaseAuthGuard } from './infrastructure/SupabaseAuthGuard';

@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    SupabaseJwtVerifier,
    SupabaseAuthGuard,
    { provide: UserRepository, useClass: PrismaUserRepository },
    { provide: AccessTokenVerifier, useExisting: SupabaseJwtVerifier },
  ],
  exports: [SupabaseAuthGuard, AccessTokenVerifier, UserRepository],
})
export class AuthModule {}
