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
import type { UsageEntry } from '../../../shared/usage-ranking.js';

const WITH_CATEGORY = { treatment_categories: true } as const;

@Injectable()
export class PrismaTreatmentsRepository implements ITreatmentRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findUsageByDoctor(
    doctorId: string,
    since: Date,
  ): Promise<UsageEntry[]> {
    const rows = await this.prisma.tooth_procedures.findMany({
      where: {
        performed_by: doctorId,
        procedure_date: { gte: since },
        treatments: { is_active: true },
      },
      select: {
        id: true,
        treatment_id: true,
        application_group_id: true,
        procedure_date: true,
      },
    });
    return rows.map((r) => ({
      key: r.treatment_id,
      occurrence: r.application_group_id ?? r.id,
      at: r.procedure_date,
    }));
  }

  async findActive(): Promise<Treatment[]> {
    const records = await this.prisma.treatments.findMany({
      where: { is_active: true },
      include: WITH_CATEGORY,
      // Orden de categoría, después orden dentro de la categoría (CLI-41) —
      // así el frontend agrupa por categoryCode en el orden en que llegan,
      // sin necesitar un endpoint aparte para el orden de las categorías.
      orderBy: [
        { treatment_categories: { display_order: 'asc' } },
        { display_order: 'asc' },
      ],
    });
    return records.map((r) => TreatmentMapper.toDomain(r));
  }

  async findById(id: string): Promise<Treatment | null> {
    const record = await this.prisma.treatments.findUnique({
      where: { id },
      include: WITH_CATEGORY,
    });
    return record ? TreatmentMapper.toDomain(record) : null;
  }

  async findDefaultConsultation(): Promise<Treatment | null> {
    const record = await this.prisma.treatments.findFirst({
      where: { is_default_consultation: true },
      include: WITH_CATEGORY,
    });
    return record ? TreatmentMapper.toDomain(record) : null;
  }

  async create(data: CreateTreatmentData): Promise<Treatment> {
    const record = await this.prisma.treatments.create({
      data: {
        code: data.code,
        name: data.name,
        description: data.description ?? null,
        base_price: data.basePrice,
        estimated_minutes: data.estimatedMinutes ?? 30,
        application_type: data.applicationType,
        currency: data.currency,
        display_order: data.displayOrder ?? 0,
        is_active: data.isActive ?? true,
        treatment_categories: { connect: { code: data.categoryCode } },
      },
      include: WITH_CATEGORY,
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
          code: data.code,
          name: data.name,
          description: data.description,
          base_price: data.basePrice,
          estimated_minutes: data.estimatedMinutes,
          application_type: data.applicationType,
          currency: data.currency,
          display_order: data.displayOrder,
          is_active: data.isActive,
          treatment_categories: data.categoryCode
            ? { connect: { code: data.categoryCode } }
            : undefined,
        },
        include: WITH_CATEGORY,
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
