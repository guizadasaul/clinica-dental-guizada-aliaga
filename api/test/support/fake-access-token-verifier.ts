import { UnauthorizedException } from '@nestjs/common';
import type { AccessTokenVerifier } from '../../src/auth/domain/AccessTokenVerifier';
import type { AuthenticatedUser } from '../../src/auth/domain/AuthenticatedUser';

/**
 * Reemplaza a SupabaseJwtVerifier en los e2e: cada token de test ("token-...")
 * mapea a un auth_user_id conocido, sin red ni JWKS. Un token desconocido es
 * un 401, igual que un JWT inválido en producción.
 */
export class FakeAccessTokenVerifier implements AccessTokenVerifier {
  private readonly users = new Map<string, AuthenticatedUser>();

  register(token: string, authUserId: string): void {
    this.users.set(token, {
      uid: authUserId,
      email: null,
      phone: null,
      displayName: null,
      photoUrl: null,
    });
  }

  verify(token: string): Promise<AuthenticatedUser> {
    const user = this.users.get(token);
    return user
      ? Promise.resolve(user)
      : Promise.reject(new UnauthorizedException('Token inválido'));
  }
}
