import { CanActivate, ExecutionContext, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';
import { AccessTokenVerifier } from '../domain/AccessTokenVerifier';
import { AuthenticatedUser } from '../domain/AuthenticatedUser';

export interface AuthenticatedRequest extends Request {
  user: AuthenticatedUser;
}

@Injectable()
export class SupabaseAuthGuard implements CanActivate {
  constructor(@Inject(AccessTokenVerifier) private readonly verifier: AccessTokenVerifier) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractToken(request);

    if (!token) {
      throw new UnauthorizedException('No token provided');
    }

    const user = await this.verifier.verify(token);
    (request as AuthenticatedRequest).user = user;
    return true;
  }

  private extractToken(request: Request): string | undefined {
    const auth = request.headers['authorization'];
    if (typeof auth === 'string' && auth.startsWith('Bearer ')) {
      return auth.substring(7);
    }
    return undefined;
  }
}
