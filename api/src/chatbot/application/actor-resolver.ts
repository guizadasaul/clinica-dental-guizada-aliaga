import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import type { User } from '../../auth/domain/User';
import { UserRole } from '../../auth/domain/value-objects/UserRole';
import { PatientRepository } from '../../patients/domain/PatientRepository';
import type { IPatientRepository } from '../../patients/domain/PatientRepository';
import type { ChatActor } from '../domain/ChatActor';

/**
 * Traduce la identidad autenticada a un ChatActor (CLI-89). El rol sale
 * siempre de la fila `users` (la misma que dejó RolesGuard en
 * request.appUser), nunca del JWT ni del texto del mensaje.
 */
@Injectable()
export class ActorResolver {
  constructor(
    @Inject(PatientRepository) private readonly patientRepo: IPatientRepository,
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

  anonymous(): ChatActor {
    return { kind: 'anonymous' };
  }
}
