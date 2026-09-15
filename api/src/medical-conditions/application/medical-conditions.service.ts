import { Injectable, Inject } from '@nestjs/common';
import { MedicalConditionRepository } from '../domain/MedicalConditionRepository';
import type { IMedicalConditionRepository } from '../domain/MedicalConditionRepository';
import type { MedicalCondition } from '../domain/MedicalCondition';

@Injectable()
export class MedicalConditionsService {
  constructor(
    @Inject(MedicalConditionRepository)
    private readonly medicalConditionRepo: IMedicalConditionRepository,
  ) {}

  findCatalog(): Promise<MedicalCondition[]> {
    return this.medicalConditionRepo.findCatalog();
  }
}
