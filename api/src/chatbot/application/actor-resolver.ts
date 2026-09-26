import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import type { User } from '../../auth/domain/User';
import { UserRole } from '../../auth/domain/value-objects/UserRole';
import { UserRepository } from '../../auth/domain/UserRepository';
import type { UserRepository as IUserRepository } from '../../auth/domain/UserRepository';
import { PatientRepository } from '../../patients/domain/PatientRepository';
import type { IPatientRepository } from '../../patients/domain/PatientRepository';
import type { ChatActor } from '../domain/ChatActor';

/** Cómo se reconoció a quien escribe por un canal externo (CLI-146). */
export type ChannelSenderMatch =
  | 'linked'
  | 'staff'
  | 'patient'
  | 'ambiguous'
  | 'unknown';

export interface ChannelSender {
  actor: ChatActor;
  match: ChannelSenderMatch;
}

const STAFF_ROLES: ReadonlySet<UserRole> = new Set([
  UserRole.ODONTOLOGIST,
  UserRole.ADMIN,
]);
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
   * Quién escribe por un canal externo (CLI-100 + CLI-146), sin que se
   * autentique. En orden:
   * 1. vínculo por código activo (VINCULAR ######): tiene prioridad;
   * 2. el número de UN solo doctor o admin activo;
   * 3. el número de UN solo paciente activo;
   * 4. si varias cuentas comparten el número (una familia), no se adivina:
   *    anónimo con match "ambiguous" para que el canal sugiera el código;
   * 5. si no coincide con nadie, anónimo (solo tools públicas).
   * Una cuenta dada de baja nunca se reconoce.
   */
  async fromChannelSender(
    channel: LinkableChannel,
    externalId: string,
  ): Promise<ChannelSender> {
    const identity = await this.identityRepo.findActiveByExternalId(
      channel,
      externalId,
    );
    if (identity) {
      const linked = await this.userRepo.findById(identity.userId);
      if (linked?.isActive) {
        return { actor: await this.fromAppUser(linked), match: 'linked' };
      }
    }

    const owners = await this.userRepo.findActiveByPhone(externalId);
    const staff = owners.filter((u) => STAFF_ROLES.has(u.role));
    const patients = owners.filter((u) => u.role === UserRole.PATIENT);
    if (staff.length === 1) {
      return { actor: await this.fromAppUser(staff[0]), match: 'staff' };
    }
    if (staff.length === 0 && patients.length === 1) {
      return { actor: await this.fromAppUser(patients[0]), match: 'patient' };
    }
    return {
      actor: this.anonymous(),
      match: owners.length > 1 ? 'ambiguous' : 'unknown',
    };
  }

  anonymous(): ChatActor {
    return { kind: 'anonymous' };
  }
}
