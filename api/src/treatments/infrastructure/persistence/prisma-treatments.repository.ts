import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service.js';
import type {
  ITreatmentRepository,
  CreateTreatmentData,
  UpdateTreatmentData,
} from '../../domain/TreatmentRepository.js';
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

  async findById(id: string): Promise<Treatment | null> {
    const record = await this.prisma.treatments.findUnique({
      where: { id },
    });
    return record ? TreatmentMapper.toDomain(record) : null;
  }

  async findDefaultConsultation(): Promise<Treatment | null> {
    const record = await this.prisma.treatments.findFirst({
      where: { is_default_consultation: true },
    });
    return record ? TreatmentMapper.toDomain(record) : null;
  }

  async create(data: CreateTreatmentData): Promise<Treatment> {
    const record = await this.prisma.treatments.create({
      data: {
        name: data.name,
        description: data.description ?? null,
        base_price: data.basePrice,
        estimated_minutes: data.estimatedMinutes ?? 30,
        scope: data.scope,
        currency: data.currency,
        is_active: data.isActive ?? true,
      },
    });
    return TreatmentMapper.toDomain(record);
  }

  async update(
    id: string,
    data: UpdateTreatmentData,
  ): Promise<Treatment | null> {
    try {
      const record = await this.prisma.treatments.update({
        where: { id },
        data: {
          name: data.name,
          description: data.description,
          base_price: data.basePrice,
          estimated_minutes: data.estimatedMinutes,
          scope: data.scope,
          currency: data.currency,
          is_active: data.isActive,
        },
      });
      return TreatmentMapper.toDomain(record);
    } catch (error: unknown) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        return null;
      }
      throw error;
    }
  }
}
