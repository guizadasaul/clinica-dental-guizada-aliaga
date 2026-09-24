import { Injectable, Inject } from '@nestjs/common';
import { DiagnosisRepository } from '../domain/DiagnosisRepository';
import type { IDiagnosisRepository } from '../domain/DiagnosisRepository';
import type { DiagnosisCategory } from '../domain/DiagnosisCategory';
import { frequentSince, rankByUsage } from '../../shared/usage-ranking';

@Injectable()
export class DiagnosesService {
  constructor(
    @Inject(DiagnosisRepository)
    private readonly diagnosisRepo: IDiagnosisRepository,
  ) {}

  findCatalog(): Promise<DiagnosisCategory[]> {
    return this.diagnosisRepo.findCatalog();
  }

  /** Códigos de los diagnósticos que más usa el doctor en el último año, el más usado primero (CLI-118). */
  async findFrequentCodes(doctorId: string, limit: number): Promise<string[]> {
    const usage = await this.diagnosisRepo.findUsageByDoctor(
      doctorId,
      frequentSince(),
    );
    return rankByUsage(usage, limit);
  }
}
