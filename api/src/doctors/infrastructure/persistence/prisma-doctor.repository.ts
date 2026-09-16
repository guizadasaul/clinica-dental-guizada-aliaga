import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service.js';
import type { Doctor } from '../../domain/Doctor.js';
import type { IDoctorRepository } from '../../domain/DoctorRepository.js';
import { DoctorMapper } from './doctor.mapper.js';

@Injectable()
export class PrismaDoctorRepository implements IDoctorRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findBookable(): Promise<Doctor[]> {
    // CLI-63: is_active también filtra acá — antes de esto, dar de baja a un
    // doctor (users.is_active = false) no lo sacaba de la reserva pública,
    // solo doctor_profiles.is_bookable lo hacía.
    const records = await this.prisma.doctor_profiles.findMany({
      where: { is_bookable: true, users: { is_active: true } },
      orderBy: { display_order: 'asc' },
      include: { users: true },
    });
    return records.map((record) => DoctorMapper.toDomain(record));
  }

  async isBookable(doctorId: string): Promise<boolean> {
    const record = await this.prisma.doctor_profiles.findUnique({
      where: { user_id: doctorId },
      select: { is_bookable: true, users: { select: { is_active: true } } },
    });
    return (record?.is_bookable && record.users.is_active) ?? false;
  }
}
