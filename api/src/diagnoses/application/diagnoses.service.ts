import { Injectable, Inject } from '@nestjs/common';
import { DiagnosisRepository } from '../domain/DiagnosisRepository';
import type { IDiagnosisRepository } from '../domain/DiagnosisRepository';
import type { DiagnosisCategory } from '../domain/DiagnosisCategory';

@Injectable()
export class DiagnosesService {
  constructor(
    @Inject(DiagnosisRepository)
    private readonly diagnosisRepo: IDiagnosisRepository,
  ) {}

  findCatalog(): Promise<DiagnosisCategory[]> {
    return this.diagnosisRepo.findCatalog();
  }
}
