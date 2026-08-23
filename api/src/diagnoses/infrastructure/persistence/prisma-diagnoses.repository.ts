import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service.js';
import type { IDiagnosisRepository } from '../../domain/DiagnosisRepository.js';
import type { DiagnosisCategory } from '../../domain/DiagnosisCategory.js';
import type { Diagnosis } from '../../domain/Diagnosis.js';
import { DiagnosisMapper } from './diagnosis.mapper.js';

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
        },
      },
    });
    return records
      .map((r) => DiagnosisMapper.toDomainCategory(r))
      .filter((category) => category.diagnoses.length > 0);
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
