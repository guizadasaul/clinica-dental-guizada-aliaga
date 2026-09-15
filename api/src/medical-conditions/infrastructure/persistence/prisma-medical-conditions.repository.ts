import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service.js';
import type { IMedicalConditionRepository } from '../../domain/MedicalConditionRepository.js';
import type { MedicalCondition } from '../../domain/MedicalCondition.js';
import { MedicalConditionMapper } from './medical-condition.mapper.js';

@Injectable()
export class PrismaMedicalConditionsRepository
  implements IMedicalConditionRepository
{
  constructor(private readonly prisma: PrismaService) {}

  async findCatalog(): Promise<MedicalCondition[]> {
    const records = await this.prisma.medical_conditions.findMany({
      where: { is_active: true },
      orderBy: { display_order: 'asc' },
    });
    return records.map((r) => MedicalConditionMapper.toDomain(r));
  }

  async findByCodes(codes: string[]): Promise<MedicalCondition[]> {
    if (codes.length === 0) {
      return [];
    }
    const records = await this.prisma.medical_conditions.findMany({
      where: { code: { in: codes } },
    });
    return records.map((r) => MedicalConditionMapper.toDomain(r));
  }
}
