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

  async findById(id: string): Promise<User | null> {
    const record = await this.prisma.users.findUnique({ where: { id } });
    return record ? UserMapper.toDomain(record) : null;
  }

  async findByAuthUserId(authUserId: string): Promise<User | null> {
    const record = await this.prisma.users.findUnique({
      where: { auth_user_id: authUserId },
    });
    return record ? UserMapper.toDomain(record) : null;
  }

  /**
   * El display_name de un doctor es su nombre público ("Dra. Marylu Aliaga"),
   * el que ve el paciente al reservar y que cargó el admin (CLI-77). Un login
   * jamás lo pisa con el nombre de la cuenta de Google/Supabase — el resto de
   * los perfiles (pacientes, admin) sí lo siguen sincronizando.
   */
  private async isDoctor(where: Prisma.usersWhereInput): Promise<boolean> {
    const count = await this.prisma.doctor_profiles.count({
      where: { users: where },
    });
    return count > 0;
  }

  async upsertByAuthUserId(data: UpsertUserData): Promise<User> {
    const keepPublicName = await this.isDoctor({
      auth_user_id: data.authUserId,
    });
    try {
      const record = await this.prisma.users.upsert({
        where: { auth_user_id: data.authUserId },
        create: {
          auth_user_id: data.authUserId,
          email: data.email,
          ...(data.phone !== undefined && { phone: data.phone }),
          display_name: data.displayName,
          photo_url: data.photoUrl,
          role: UserRole.PATIENT,
        },
        update: {
          // Solo pisa el email si este login trajo uno de verdad — un login
          // por teléfono no manda email en absoluto (null), y sin esta
          // guarda un simple re-sync borraría el email ya cargado por otro
          // canal (Google, registro por correo, o la ficha que llenó el
          // doctor).
          ...(data.email !== null && { email: data.email }),
          // El teléfono de users es el de la ficha, el oficial (CLI-144):
          // un login no lo reemplaza. Solo se toma del login al crear la fila.
          // Tampoco se pisa un nombre con null: un login por teléfono no trae
          // nombre, y borraría el que cargó el doctor en la ficha.
          ...(!keepPublicName &&
            data.displayName !== null && { display_name: data.displayName }),
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
        const keepRelinkedName = await this.isDoctor({ email: data.email });
        const record = await this.prisma.users.update({
          where: { email: data.email },
          data: {
            auth_user_id: data.authUserId,
            ...(!keepRelinkedName && { display_name: data.displayName }),
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
      const record = await this.prisma.transaction(async (tx) => {
        const isDoctor =
          (await tx.doctor_profiles.count({ where: { user_id: userId } })) > 0;
        const current = await tx.users.findUnique({
          where: { id: userId },
          select: { phone: true },
        });
        const { count } = await tx.users.updateMany({
          where: { id: userId, auth_user_id: null },
          data: {
            auth_user_id: data.authUserId,
            // Mismo motivo que en upsertByAuthUserId: un login por teléfono no
            // trae email (null) — no pisar el que ya haya en la ficha.
            ...(data.email !== null && { email: data.email }),
            // El teléfono de la ficha es el oficial (CLI-144): el del login
            // solo se guarda si la ficha no tenía ninguno.
            ...(data.phone !== undefined &&
              !current?.phone && { phone: data.phone }),
            // Un doctor conserva el nombre público que le cargó el admin
            // (CLI-77) — ver isDoctor(). A un paciente tampoco se le pisa el
            // nombre de la ficha con null (un registro por teléfono no trae
            // nombre, CLI-144).
            ...(!isDoctor &&
              data.displayName !== null && { display_name: data.displayName }),
            photo_url: data.photoUrl,
            updated_at: new Date(),
          },
        });
        if (count === 0) {
          return null;
        }
        if (isDoctor) {
          // Canjear la invitación es lo que vuelve reservable a un doctor
          // recién creado (nace con is_bookable=false). Uno dado de baja
          // (is_active=false) sigue sin poder reservarse.
          await tx.doctor_profiles.updateMany({
            where: { user_id: userId, users: { is_active: true } },
            data: { is_bookable: true, updated_at: new Date() },
          });
        }
        return tx.users.findUnique({ where: { id: userId } });
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
