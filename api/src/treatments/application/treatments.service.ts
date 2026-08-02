import { Injectable, Inject } from '@nestjs/common';
import { TreatmentRepository } from '../domain/TreatmentRepository';
import type { ITreatmentRepository } from '../domain/TreatmentRepository';
import type { Treatment } from '../domain/Treatment';

@Injectable()
export class TreatmentsService {
  constructor(
    @Inject(TreatmentRepository)
    private readonly treatmentRepo: ITreatmentRepository,
  ) {}

  findActive(): Promise<Treatment[]> {
    return this.treatmentRepo.findActive();
  }
}
