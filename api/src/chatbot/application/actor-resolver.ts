import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import type { User } from '../../auth/domain/User';
import { UserRole } from '../../auth/domain/value-objects/UserRole';
import { UserRepository } from '../../auth/domain/UserRepository';
import type { UserRepository as IUserRepository } from '../../auth/domain/UserRepository';
import { PatientRepository } from '../../patients/domain/PatientRepository';
import type { IPatientRepository } from '../../patients/domain/PatientRepository';
import type { ChatActor } from '../domain/ChatActor';
import { ChannelIdentityRepository } from '../domain/ChannelIdentity';
import type {
  ChannelIdentityRepository as IChannelIdentityRepository,
  LinkableChannel,
} from '../domain/ChannelIdentity';

/**
 * Traduce la identidad autenticada a un ChatActor (CLI-89). El rol sale
 * siempre de la fila `users` (la misma que dejó RolesGuard en
 * request.appUser), nunca del JWT ni del texto del mensaje.
 */
@Injectable()
export class ActorResolver {
  constructor(
    @Inject(PatientRepository) private readonly patientRepo: IPatientRepository,
    @Inject(ChannelIdentityRepository)
    private readonly identityRepo: IChannelIdentityRepository,
    @Inject(UserRepository) private readonly userRepo: IUserRepository,
  ) {}

  async fromAppUser(user: User): Promise<ChatActor> {
    // RolesGuard no mira is_active (pendiente documentado en api/CLAUDE.md);
    // el chat sí: un doctor dado de baja no sigue consultando por acá.
    // 403 y no 401, mismo criterio que RolesGuard.
    if (!user.isActive) {
      throw new ForbiddenException('Tu cuenta está desactivada');
    }
    const patientId =
      user.role === UserRole.PATIENT
        ? ((await this.patientRepo.findByUserId(user.id))?.id ?? null)
        : null;
    return { kind: 'user', userId: user.id, role: user.role, patientId };
  }

  /**
   * Actor de un mensaje de un canal externo (CLI-100): el usuario solo si el
   * número tiene un vínculo activo, probado con un código, y la cuenta sigue
   * activa. Sin vínculo, revocado o con la cuenta dada de baja → anónimo
   * (solo tools públicas). Nunca se busca por users.phone.
   */
  async fromChannelIdentity(
    channel: LinkableChannel,
    externalId: string,
  ): Promise<ChatActor> {
    const identity = await this.identityRepo.findActiveByExternalId(
      channel,
      externalId,
    );
    if (!identity) return this.anonymous();
    const user = await this.userRepo.findById(identity.userId);
    if (!user?.isActive) return this.anonymous();
    return this.fromAppUser(user);
  }

  anonymous(): ChatActor {
    return { kind: 'anonymous' };
  }
}
