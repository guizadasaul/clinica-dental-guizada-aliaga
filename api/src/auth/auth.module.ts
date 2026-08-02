import { Module } from '@nestjs/common';
import { AuthController } from './infrastructure/http/auth.controller';
import { PhoneAuthController } from './infrastructure/http/phone-auth.controller';
import { AuthService } from './application/auth.service';
import { UserRepository } from './domain/UserRepository';
import { TokenPort } from './domain/TokenPort';
import { PrismaUserRepository } from './infrastructure/persistence/prisma-user.repository';
import { FirebaseService } from './infrastructure/FirebaseService';
import { FirebaseAuthGuard } from './infrastructure/FirebaseAuthGuard';

@Module({
  controllers: [AuthController, PhoneAuthController],
  providers: [
    AuthService,
    FirebaseService,
    FirebaseAuthGuard,
    { provide: UserRepository, useClass: PrismaUserRepository },
    { provide: TokenPort, useExisting: FirebaseService },
  ],
  exports: [FirebaseAuthGuard, FirebaseService, UserRepository],
})
export class AuthModule {}
