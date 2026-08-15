import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { UserRole } from '../../domain/value-objects/UserRole.js';
import { PrismaService } from '../../../shared/prisma/prisma.service.js';
import { User } from '../../domain/User.js';
import {
  CreatePlaceholderUserData,
  LinkAuthIdentityData,
  UpdateContactInfoData,
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
    try {
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
    } catch (error: unknown) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002' &&
        data.email
      ) {
        // El email ya pertenece a otra fila con un auth_user_id distinto —
        // típico de una fila creada antes de que esta persona tuviera cuenta
        // real (seed manual, dato de prueba, etc.). Google ya verificó el
        // email en el login, así que es seguro re-vincular esa fila al
        // auth_user_id actual en vez de romper con 500 y dejar afuera a
        // alguien que sí tiene una cuenta legítima.
        const record = await this.prisma.users.update({
          where: { email: data.email },
          data: {
            auth_user_id: data.authUserId,
            display_name: data.displayName,
            photo_url: data.photoUrl,
            updated_at: new Date(),
          },
        });
        return UserMapper.toDomain(record);
      }
      throw error;
    }
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

  async updateContactInfo(
    userId: string,
    data: UpdateContactInfoData,
  ): Promise<User | null> {
    try {
      const record = await this.prisma.users.update({
        where: { id: userId },
        data: {
          ...(data.email !== undefined && { email: data.email }),
          ...(data.phone !== undefined && { phone: data.phone }),
          ...(data.displayName !== undefined && {
            display_name: data.displayName,
          }),
          updated_at: new Date(),
        },
      });
      return UserMapper.toDomain(record);
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2025') {
          return null;
        }
        if (error.code === 'P2002') {
          throw new ConflictException(
            'El email ya está en uso por otra cuenta',
          );
        }
      }
      throw error;
    }
  }
}
