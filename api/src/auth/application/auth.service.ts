import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import type { AuthenticatedUser } from '../domain/AuthenticatedUser';
import { User } from '../domain/User';
import { UserRepository } from '../domain/UserRepository';

@Injectable()
export class AuthService {
  constructor(@Inject(UserRepository) private readonly userRepository: UserRepository) {}

  syncUser(authUser: AuthenticatedUser): Promise<User> {
    return this.userRepository.upsertByAuthUserId({
      authUserId: authUser.uid,
      email: authUser.email,
      displayName: authUser.displayName,
      photoUrl: authUser.photoUrl,
    });
  }

  async getCurrentUser(uid: string): Promise<User> {
    const user = await this.userRepository.findByAuthUserId(uid);
    if (!user) {
      throw new NotFoundException('User not found. Call POST /auth/sync first.');
    }
    return user;
  }
}
