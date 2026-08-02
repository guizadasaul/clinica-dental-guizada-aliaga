import { Injectable } from '@nestjs/common';
import { UserRole } from '../../domain/value-objects/UserRole.js';
import { PrismaService } from '../../../shared/prisma/prisma.service.js';
import { User } from '../../domain/User.js';
import { CreatePhoneUserData, UpsertUserData, UserRepository } from '../../domain/UserRepository.js';
import { UserMapper } from './user.mapper.js';

@Injectable()
export class PrismaUserRepository implements UserRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByFirebaseUid(firebaseUid: string): Promise<User | null> {
    const record = await this.prisma.users.findUnique({
      where: { firebase_uid: firebaseUid },
    });
    return record ? UserMapper.toDomain(record) : null;
  }

  async findByPhone(phone: string): Promise<User | null> {
    const record = await this.prisma.users.findFirst({
      where: { phone },
    });
    return record ? UserMapper.toDomain(record) : null;
  }

  async upsertByFirebaseUid(data: UpsertUserData): Promise<User> {
    const record = await this.prisma.users.upsert({
      where: { firebase_uid: data.firebaseUid },
      create: {
        firebase_uid: data.firebaseUid,
        email: data.email,
        display_name: data.displayName,
        photo_url: data.photoUrl,
        phone: data.phone ?? null,
        role: UserRole.PATIENT,
      },
      update: {
        email: data.email,
        display_name: data.displayName,
        photo_url: data.photoUrl,
        ...(data.phone !== undefined && { phone: data.phone }),
        updated_at: new Date(),
      },
    });
    return UserMapper.toDomain(record);
  }

  async createPhoneUser(data: CreatePhoneUserData): Promise<User> {
    const record = await this.prisma.users.create({
      data: {
        firebase_uid: data.firebaseUid,
        display_name: data.displayName,
        phone: data.phone,
        password_hash: data.passwordHash,
        role: UserRole.PATIENT,
      },
    });
    return UserMapper.toDomain(record);
  }
}
