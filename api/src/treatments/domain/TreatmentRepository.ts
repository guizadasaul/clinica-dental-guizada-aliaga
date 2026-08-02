import type { Treatment } from './Treatment';

export interface ITreatmentRepository {
  findActive(): Promise<Treatment[]>;
}

export const TreatmentRepository = Symbol('ITreatmentRepository');
