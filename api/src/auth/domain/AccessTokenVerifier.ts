import type { AuthenticatedUser } from './AuthenticatedUser';

export interface AccessTokenVerifier {
  verify(token: string): Promise<AuthenticatedUser>;
}

export const AccessTokenVerifier = Symbol('AccessTokenVerifier');
