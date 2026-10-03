import { Injectable } from '@nestjs/common';
import type { doctor_time_blocks } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service.js';
import type { DoctorTimeBlock } from '../../domain/DoctorTimeBlock.js';
import type {
  CreateDoctorTimeBlockData,
  IDoctorTimeBlockRepository,
} from '../../domain/DoctorTimeBlockRepository.js';

function toDomain(record: doctor_time_blocks): DoctorTimeBlock {
  return {
    id: record.id,
    doctorId: record.doctor_id,
    startsAt: record.starts_at,
    endsAt: record.ends_at,
    reason: record.reason,
  };
}

@Injectable()
export class PrismaDoctorTimeBlocksRepository implements IDoctorTimeBlockRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: CreateDoctorTimeBlockData): Promise<DoctorTimeBlock> {
    const record = await this.prisma.doctor_time_blocks.create({
      data: {
        doctor_id: data.doctorId,
        starts_at: data.startsAt,
        ends_at: data.endsAt,
        reason: data.reason,
      },
    });
    return toDomain(record);
  }

  async findOverlapping(
    doctorId: string,
    from: Date,
    to: Date,
  ): Promise<DoctorTimeBlock[]> {
    const records = await this.prisma.doctor_time_blocks.findMany({
      where: {
        doctor_id: doctorId,
        starts_at: { lt: to },
        ends_at: { gt: from },
      },
      orderBy: { starts_at: 'asc' },
    });
    return records.map(toDomain);
  }

  async deleteOwn(id: string, doctorId: string): Promise<boolean> {
    const { count } = await this.prisma.doctor_time_blocks.deleteMany({
      where: { id, doctor_id: doctorId },
    });
    return count > 0;
  }
}
