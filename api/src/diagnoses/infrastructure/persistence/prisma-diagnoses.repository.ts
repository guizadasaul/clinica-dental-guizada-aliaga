import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service.js';
import type { IDiagnosisRepository } from '../../domain/DiagnosisRepository.js';
import type { DiagnosisCategory } from '../../domain/DiagnosisCategory.js';
import type { Diagnosis } from '../../domain/Diagnosis.js';
import { DiagnosisMapper } from './diagnosis.mapper.js';
import type { UsageEntry } from '../../../shared/usage-ranking.js';

@Injectable()
export class PrismaDiagnosesRepository implements IDiagnosisRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findCatalog(): Promise<DiagnosisCategory[]> {
    const records = await this.prisma.diagnosis_categories.findMany({
      orderBy: { display_order: 'asc' },
      include: {
        diagnoses: {
          where: { is_active: true },
          orderBy: { display_order: 'asc' },
          // Solo sugerencias de tratamientos activos, la más habitual primero (CLI-119).
          include: {
            diagnosis_treatment_suggestions: {
              where: { treatments: { is_active: true } },
              orderBy: { rank: 'asc' },
              select: { treatment_id: true },
            },
          },
        },
      },
    });
    return records
      .map((r) => DiagnosisMapper.toDomainCategory(r))
      .filter((category) => category.diagnoses.length > 0);
  }

  async findUsageByDoctor(
    doctorId: string,
    since: Date,
  ): Promise<UsageEntry[]> {
    const rows = await this.prisma.dental_exam_findings.findMany({
      where: {
        diagnoses: { is_active: true },
        dental_exams: { recorded_by: doctorId, recorded_at: { gte: since } },
      },
      select: {
        diagnoses: { select: { code: true } },
        dental_exams: { select: { patient_id: true, recorded_at: true } },
      },
    });
    return rows.map((r) => ({
      key: r.diagnoses.code,
      occurrence: r.dental_exams.patient_id,
      at: r.dental_exams.recorded_at,
    }));
  }

  async findByCodes(codes: string[]): Promise<Diagnosis[]> {
    if (codes.length === 0) {
      return [];
    }
    const records = await this.prisma.diagnoses.findMany({
      where: { code: { in: codes } },
    });
    return records.map((r) => DiagnosisMapper.toDomain(r));
  }
}
