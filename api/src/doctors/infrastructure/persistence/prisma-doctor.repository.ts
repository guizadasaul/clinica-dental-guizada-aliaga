import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service.js';
import type { Doctor } from '../../domain/Doctor.js';
import type { IDoctorRepository } from '../../domain/DoctorRepository.js';
import { DoctorMapper } from './doctor.mapper.js';

@Injectable()
export class PrismaDoctorRepository implements IDoctorRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findBookable(): Promise<Doctor[]> {
    const records = await this.prisma.doctor_profiles.findMany({
      where: { is_bookable: true },
      orderBy: { display_order: 'asc' },
      include: { users: true },
    });
    return records.map((record) => DoctorMapper.toDomain(record));
  }

  async isBookable(doctorId: string): Promise<boolean> {
    const record = await this.prisma.doctor_profiles.findUnique({
      where: { user_id: doctorId },
      select: { is_bookable: true },
    });
    return record?.is_bookable ?? false;
  }
}
