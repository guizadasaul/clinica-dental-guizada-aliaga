import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { UserRole } from '../../domain/value-objects/UserRole.js';
import { PrismaService } from '../../../shared/prisma/prisma.service.js';
import { User } from '../../domain/User.js';
import {
  CreatePlaceholderUserData,
  LinkAuthIdentityData,
  UpsertUserData,
  UserRepository,
} from '../../domain/UserRepository.js';
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

  async createPlaceholder(data: CreatePlaceholderUserData): Promise<User> {
    const record = await this.prisma.users.create({
      data: UserMapper.toPlaceholderCreateInput(data),
    });
    return UserMapper.toDomain(record);
  }

  async linkAuthIdentity(
    userId: string,
    data: LinkAuthIdentityData,
  ): Promise<User | null> {
    try {
      const { count } = await this.prisma.users.updateMany({
        where: { id: userId, auth_user_id: null },
        data: {
          auth_user_id: data.authUserId,
          email: data.email,
          display_name: data.displayName,
          photo_url: data.photoUrl,
          updated_at: new Date(),
        },
      });
      if (count === 0) {
        return null;
      }
      const record = await this.prisma.users.findUnique({
        where: { id: userId },
      });
      return record ? UserMapper.toDomain(record) : null;
    } catch (error: unknown) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('El email ya está en uso por otra cuenta');
      }
      throw error;
    }
  }
}
