import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';
import { AuthenticatedUser } from '../domain/AuthenticatedUser';
import { FirebaseService } from './FirebaseService';

export interface AuthenticatedRequest extends Request {
  user: AuthenticatedUser;
}

@Injectable()
export class FirebaseAuthGuard implements CanActivate {
  constructor(private readonly firebaseService: FirebaseService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractToken(request);

    if (!token) {
      throw new UnauthorizedException('No token provided');
    }

    const decoded = await this.firebaseService.verifyIdToken(token);
    const user: AuthenticatedUser = {
      uid: decoded.uid,
      email: decoded.email ?? '',
      displayName: decoded.name ?? null,
      photoUrl: decoded.picture ?? null,
    };
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
