import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service.js';
import { UserMapper } from '../../../auth/infrastructure/persistence/user.mapper.js';
import { UserRole } from '../../../auth/domain/value-objects/UserRole.js';
import type {
  AdminDoctorDetail,
  AdminDoctorSummary,
  CreateAdminDoctorData,
  UpdateAdminDoctorData,
} from '../../domain/AdminDoctor.js';
import type { IAdminDoctorRepository } from '../../domain/AdminDoctorRepository.js';
import { AdminDoctorMapper } from './admin-doctor.mapper.js';

const SCHEDULE_ORDER_BY = [
  { weekday: 'asc' as const },
  { start_time: 'asc' as const },
];

@Injectable()
export class PrismaAdminDoctorRepository implements IAdminDoctorRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(): Promise<AdminDoctorSummary[]> {
    const records = await this.prisma.doctor_profiles.findMany({
      orderBy: { display_order: 'asc' },
      include: { users: true },
    });
    return records.map((record) => AdminDoctorMapper.toSummary(record));
  }

  async findById(id: string): Promise<AdminDoctorDetail | null> {
    const record = await this.prisma.doctor_profiles.findUnique({
      where: { user_id: id },
      include: { users: true },
    });
    if (!record) {
      return null;
    }
    const scheduleBlocks = await this.prisma.doctor_schedule_blocks.findMany({
      where: { doctor_id: id },
      orderBy: SCHEDULE_ORDER_BY,
    });
    return AdminDoctorMapper.toDetail(record, scheduleBlocks);
  }

  async create(data: CreateAdminDoctorData): Promise<AdminDoctorDetail> {
    try {
      return await this.prisma.transaction(async (tx) => {
        const user = await tx.users.create({
          data: UserMapper.toPlaceholderCreateInput({
            displayName: data.displayName,
            phone: data.phone,
            email: data.email,
            role: UserRole.ODONTOLOGIST,
          }),
        });
        const profile = await tx.doctor_profiles.create({
          data: {
            user_id: user.id,
            first_name: data.firstName,
            last_name_paternal: data.lastNamePaternal,
            last_name_maternal: data.lastNameMaternal,
            specialty: data.specialty,
            bio: data.bio,
            photo_url: data.photoUrl,
            display_order: data.displayOrder ?? 0,
            is_bookable: true,
          },
        });
        if (data.scheduleBlocks.length > 0) {
          await tx.doctor_schedule_blocks.createMany({
            data: data.scheduleBlocks.map((block) => ({
              doctor_id: user.id,
              weekday: block.weekday,
              start_time: block.start,
              end_time: block.end,
            })),
          });
        }
        const scheduleBlocks = await tx.doctor_schedule_blocks.findMany({
          where: { doctor_id: user.id },
          orderBy: SCHEDULE_ORDER_BY,
        });
        return AdminDoctorMapper.toDetail(
          { ...profile, users: user },
          scheduleBlocks,
        );
      });
    } catch (error: unknown) {
      throw PrismaAdminDoctorRepository.translateEmailConflict(error);
    }
  }

  async update(
    id: string,
    data: UpdateAdminDoctorData,
  ): Promise<AdminDoctorDetail | null> {
    try {
      return await this.prisma.transaction(async (tx) => {
        const existingProfile = await tx.doctor_profiles.findUnique({
          where: { user_id: id },
        });
        if (!existingProfile) {
          return null;
        }

        const updatedUser = await tx.users.update({
          where: { id },
          data: {
            ...(data.displayName !== undefined && {
              display_name: data.displayName,
            }),
            ...(data.email !== undefined && { email: data.email }),
            ...(data.phone !== undefined && { phone: data.phone }),
            updated_at: new Date(),
          },
        });

        const updatedProfile = await tx.doctor_profiles.update({
          where: { user_id: id },
          data: {
            ...(data.firstName !== undefined && {
              first_name: data.firstName,
            }),
            ...(data.lastNamePaternal !== undefined && {
              last_name_paternal: data.lastNamePaternal,
            }),
            ...(data.lastNameMaternal !== undefined && {
              last_name_maternal: data.lastNameMaternal,
            }),
            ...(data.specialty !== undefined && {
              specialty: data.specialty,
            }),
            ...(data.bio !== undefined && { bio: data.bio }),
            ...(data.photoUrl !== undefined && {
              photo_url: data.photoUrl,
            }),
            ...(data.displayOrder !== undefined && {
              display_order: data.displayOrder,
            }),
            ...(data.isBookable !== undefined && {
              is_bookable: data.isBookable,
            }),
            updated_at: new Date(),
          },
        });

        // Reemplazo total del set (mismo patrón que upsertMedicalHistory en
        // patients/): solo si scheduleBlocks vino en el body, nunca lo borra
        // por default de un PATCH parcial que no toca horarios.
        if (data.scheduleBlocks !== undefined) {
          await tx.doctor_schedule_blocks.deleteMany({
            where: { doctor_id: id },
          });
          if (data.scheduleBlocks.length > 0) {
            await tx.doctor_schedule_blocks.createMany({
              data: data.scheduleBlocks.map((block) => ({
                doctor_id: id,
                weekday: block.weekday,
                start_time: block.start,
                end_time: block.end,
              })),
            });
          }
        }

        const scheduleBlocks = await tx.doctor_schedule_blocks.findMany({
          where: { doctor_id: id },
          orderBy: SCHEDULE_ORDER_BY,
        });

        return AdminDoctorMapper.toDetail(
          { ...updatedProfile, users: updatedUser },
          scheduleBlocks,
        );
      });
    } catch (error: unknown) {
      throw PrismaAdminDoctorRepository.translateEmailConflict(error);
    }
  }

  async deactivate(id: string): Promise<AdminDoctorDetail | null> {
    return this.prisma.transaction(async (tx) => {
      const existingProfile = await tx.doctor_profiles.findUnique({
        where: { user_id: id },
      });
      if (!existingProfile) {
        return null;
      }

      const [updatedUser, updatedProfile] = await Promise.all([
        tx.users.update({
          where: { id },
          data: { is_active: false, updated_at: new Date() },
        }),
        tx.doctor_profiles.update({
          where: { user_id: id },
          data: { is_bookable: false, updated_at: new Date() },
        }),
      ]);

      const scheduleBlocks = await tx.doctor_schedule_blocks.findMany({
        where: { doctor_id: id },
        orderBy: SCHEDULE_ORDER_BY,
      });

      return AdminDoctorMapper.toDetail(
        { ...updatedProfile, users: updatedUser },
        scheduleBlocks,
      );
    });
  }

  /** users.email es @unique — traduce el P2002 crudo de Prisma a un 409 legible (mismo patrón que linkAuthIdentity en prisma-user.repository.ts). */
  private static translateEmailConflict(error: unknown): unknown {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      return new ConflictException('Ya existe un usuario con ese email');
    }
    return error;
  }
}
