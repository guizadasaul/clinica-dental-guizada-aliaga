import { Injectable, Inject, Logger, NotFoundException } from '@nestjs/common';
import type { AuthenticatedUser } from '../domain/AuthenticatedUser';
import { User } from '../domain/User';
import { UserRepository } from '../domain/UserRepository';
import { PatientInvitesService } from '../../patient-invites/application/patient-invites.service';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @Inject(UserRepository) private readonly userRepository: UserRepository,
    private readonly patientInvitesService: PatientInvitesService,
  ) {}

  async syncUser(
    authUser: AuthenticatedUser,
    inviteToken?: string,
  ): Promise<User> {
    if (inviteToken) {
      const linked = await this.tryLinkInvitedUser(authUser, inviteToken);
      if (linked) {
        return linked;
      }
    }
    return this.userRepository.upsertByAuthUserId({
      authUserId: authUser.uid,
      email: authUser.email,
      displayName: authUser.displayName,
      photoUrl: authUser.photoUrl,
    });
  }

  /**
   * CONTRATO: este método nunca lanza — un token inválido/vencido/ya usado
   * solo se loguea y el login sigue el camino normal (upsertByAuthUserId).
   * /auth/sync siempre debe completar.
   */
  private async tryLinkInvitedUser(
    authUser: AuthenticatedUser,
    inviteToken: string,
  ): Promise<User | null> {
    try {
      const redeemed = await this.patientInvitesService.redeem(inviteToken);
      if (!redeemed) {
        this.logger.warn(
          `inviteToken inválido/vencido/ya usado (uid=${authUser.uid})`,
        );
        return null;
      }
      return await this.userRepository.linkAuthIdentity(redeemed.userId, {
        authUserId: authUser.uid,
        email: authUser.email,
        displayName: authUser.displayName,
        photoUrl: authUser.photoUrl,
      });
    } catch (error) {
      this.logger.error('Error al canjear inviteToken', error);
      return null;
    }
  }

  async getCurrentUser(uid: string): Promise<User> {
    const user = await this.userRepository.findByAuthUserId(uid);
    if (!user) {
      throw new NotFoundException(
        'User not found. Call POST /auth/sync first.',
      );
    }
    return user;
  }
}
