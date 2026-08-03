import { Injectable } from '@nestjs/common';
import { UserRole } from '../../domain/value-objects/UserRole.js';
import { PrismaService } from '../../../shared/prisma/prisma.service.js';
import { User } from '../../domain/User.js';
import { UpsertUserData, UserRepository } from '../../domain/UserRepository.js';
import { UserMapper } from './user.mapper.js';

@Injectable()
export class PrismaUserRepository implements UserRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByAuthUserId(authUserId: string): Promise<User | null> {
    const record = await this.prisma.users.findUnique({
      where: { auth_user_id: authUserId },
    });
    return record ? UserMapper.toDomain(record) : null;
  }

  async upsertByAuthUserId(data: UpsertUserData): Promise<User> {
    const record = await this.prisma.users.upsert({
      where: { auth_user_id: data.authUserId },
      create: {
        auth_user_id: data.authUserId,
        email: data.email,
        display_name: data.displayName,
        photo_url: data.photoUrl,
        role: UserRole.PATIENT,
      },
      update: {
        email: data.email,
        display_name: data.displayName,
        photo_url: data.photoUrl,
        updated_at: new Date(),
      },
    });
    return UserMapper.toDomain(record);
  }
}
