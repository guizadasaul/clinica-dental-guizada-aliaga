import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRepository } from '../domain/UserRepository.js';
import type { UserRepository as IUserRepository } from '../domain/UserRepository.js';
import { UserRole } from '../domain/value-objects/UserRole.js';
import type { User } from '../domain/User.js';
import { ROLES_KEY } from './roles.decorator.js';
import type { AuthenticatedRequest } from './SupabaseAuthGuard.js';

export interface AuthenticatedRequestWithAppUser extends AuthenticatedRequest {
  appUser: User;
}

/**
 * Chequea rol sobre el User de dominio — AuthenticatedUser (lo que deja
 * SupabaseAuthGuard en request.user) no tiene role, solo viene del JWT.
 * Sin @Roles() en la ruta, deja pasar (passthrough) para no romper rutas
 * que no lo usan. Siempre 403, nunca 401 — un 401 dispara el redirect
 * global a /auth/login en el frontend incluso para un usuario ya logueado.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(UserRepository) private readonly userRepository: IUserRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!request.user) {
      throw new ForbiddenException('No autorizado');
    }

    const appUser = await this.userRepository.findByAuthUserId(
      request.user.uid,
    );
    if (!appUser || !required.includes(appUser.role)) {
      throw new ForbiddenException(
        'No tenés permiso para realizar esta acción',
      );
    }

    (request as AuthenticatedRequestWithAppUser).appUser = appUser;
    return true;
  }
}
