import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service.js';
import type { ITreatmentRepository } from '../../domain/TreatmentRepository.js';
import type { Treatment } from '../../domain/Treatment.js';
import { TreatmentMapper } from './treatment.mapper.js';

@Injectable()
export class PrismaTreatmentsRepository implements ITreatmentRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findActive(): Promise<Treatment[]> {
    const records = await this.prisma.treatments.findMany({
      where: { is_active: true },
      orderBy: { name: 'asc' },
    });
    return records.map((r) => TreatmentMapper.toDomain(r));
  }

  async findDefaultConsultation(): Promise<Treatment | null> {
    const record = await this.prisma.treatments.findFirst({
      where: { is_default_consultation: true },
    });
    return record ? TreatmentMapper.toDomain(record) : null;
  }
}
