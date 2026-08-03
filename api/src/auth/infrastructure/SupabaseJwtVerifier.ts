import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { createRemoteJWKSet, decodeProtectedHeader, jwtVerify, type JWTVerifyGetKey } from 'jose';
import type { AccessTokenVerifier } from '../domain/AccessTokenVerifier';
import type { AuthenticatedUser } from '../domain/AuthenticatedUser';

@Injectable()
export class SupabaseJwtVerifier implements AccessTokenVerifier {
  private readonly logger = new Logger(SupabaseJwtVerifier.name);
  private readonly issuer: string;
  private readonly jwks: JWTVerifyGetKey;
  private readonly hmacSecret: Uint8Array | null;

  constructor() {
    const supabaseUrl = process.env['SUPABASE_URL'];
    if (!supabaseUrl) {
      throw new Error('SUPABASE_URL environment variable is required');
    }
    this.issuer = `${supabaseUrl}/auth/v1`;
    this.jwks = createRemoteJWKSet(new URL(`${supabaseUrl}/auth/v1/.well-known/jwks.json`));

    const jwtSecret = process.env['SUPABASE_JWT_SECRET'];
    this.hmacSecret = jwtSecret ? new TextEncoder().encode(jwtSecret) : null;
  }

  async verify(token: string): Promise<AuthenticatedUser> {
    try {
      const { alg } = decodeProtectedHeader(token);
      const { payload } =
        alg === 'HS256'
          ? await this.verifyHmac(token)
          : await jwtVerify(token, this.jwks, {
              issuer: this.issuer,
              audience: 'authenticated',
              algorithms: ['ES256', 'RS256'],
              clockTolerance: 5,
            });

      const meta = (payload['user_metadata'] ?? {}) as Record<string, unknown>;
      return {
        uid: payload.sub!,
        email: (payload['email'] as string) ?? '',
        displayName: (meta['name'] ?? meta['full_name'] ?? null) as string | null,
        photoUrl: (meta['picture'] ?? meta['avatar_url'] ?? null) as string | null,
      };
    } catch (error) {
      this.logger.debug(error);
      throw new UnauthorizedException('Invalid or expired token');
    }
  }

  private verifyHmac(token: string) {
    if (!this.hmacSecret) {
      throw new UnauthorizedException('Invalid or expired token');
    }
    return jwtVerify(token, this.hmacSecret, {
      issuer: this.issuer,
      audience: 'authenticated',
      algorithms: ['HS256'],
      clockTolerance: 5,
    });
  }
}
