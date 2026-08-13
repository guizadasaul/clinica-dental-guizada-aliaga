import { Injectable, Inject, Logger, NotFoundException } from '@nestjs/common';
import type { AuthenticatedUser } from '../domain/AuthenticatedUser';
import { User } from '../domain/User';
import { UserRepository } from '../domain/UserRepository';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @Inject(UserRepository) private readonly userRepository: UserRepository,
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
   * SEAM CLI-13 (link de registro para pacientes invitados): hoy no existe un
   * InviteService que resuelva inviteToken -> patientId, así que siempre
   * devuelve null y el login sigue el camino normal (upsertByAuthUserId).
   * Cuando exista: resolver el token a patients.user_id y llamar
   * this.userRepository.linkAuthIdentity(userId, {...}).
   * CONTRATO: este método nunca lanza — un token inválido solo se loguea,
   * /auth/sync siempre debe completar el login.
   */
  private tryLinkInvitedUser(
    authUser: AuthenticatedUser,
    inviteToken: string,
  ): Promise<User | null> {
    this.logger.warn(
      `inviteToken recibido (uid=${authUser.uid}, token=${inviteToken.slice(0, 8)}…) ` +
        'pero el canje de invitaciones no está implementado (CLI-13) — se ignora',
    );
    return Promise.resolve(null);
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
