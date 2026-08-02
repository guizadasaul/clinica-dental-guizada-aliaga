import { Injectable, Inject, NotFoundException, ConflictException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import type { AuthenticatedUser } from '../domain/AuthenticatedUser';
import { User } from '../domain/User';
import { UserRepository } from '../domain/UserRepository';
import { TokenPort } from '../domain/TokenPort';

@Injectable()
export class AuthService {
  constructor(
    @Inject(UserRepository) private readonly userRepository: UserRepository,
    @Inject(TokenPort) private readonly tokenPort: TokenPort,
  ) {}

  syncUser(firebaseUser: AuthenticatedUser, phone?: string | null): Promise<User> {
    return this.userRepository.upsertByFirebaseUid({
      firebaseUid: firebaseUser.uid,
      email: firebaseUser.email,
      displayName: firebaseUser.displayName,
      photoUrl: firebaseUser.photoUrl,
      phone,
    });
  }

  async getCurrentUser(uid: string): Promise<User> {
    const user = await this.userRepository.findByFirebaseUid(uid);
    if (!user) {
      throw new NotFoundException('User not found. Call POST /auth/sync first.');
    }
    return user;
  }

  async registerWithPhone(fullName: string, phone: string, password: string): Promise<string> {
    const existing = await this.userRepository.findByPhone(phone);
    if (existing) {
      throw new ConflictException('Phone number already registered');
    }
    const passwordHash = await bcrypt.hash(password, 10);
    const firebaseUid = await this.tokenPort.createFirebaseUser(fullName);
    await this.userRepository.createPhoneUser({ firebaseUid, displayName: fullName, phone, passwordHash });
    return this.tokenPort.createCustomToken(firebaseUid);
  }

  async loginWithPhone(phone: string, password: string): Promise<string> {
    const user = await this.userRepository.findByPhone(phone);
    if (!user || !user.passwordHash) {
      throw new UnauthorizedException('Invalid credentials');
    }
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Invalid credentials');
    }
    return this.tokenPort.createCustomToken(user.firebaseUid);
  }
}
