import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service.js';
import type {
  DoctorScheduleBlock,
  IDoctorScheduleRepository,
} from '../../domain/DoctorScheduleRepository.js';

@Injectable()
export class PrismaDoctorScheduleRepository implements IDoctorScheduleRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findBlocksForDoctor(doctorId: string): Promise<DoctorScheduleBlock[]> {
    const records = await this.prisma.doctor_schedule_blocks.findMany({
      where: { doctor_id: doctorId },
      orderBy: [{ weekday: 'asc' }, { start_time: 'asc' }],
    });
    return records.map((record) => ({
      weekday: record.weekday,
      start: record.start_time,
      end: record.end_time,
    }));
  }
}
