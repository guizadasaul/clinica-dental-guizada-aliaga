import type { MedicalCondition } from './MedicalCondition';

export interface IMedicalConditionRepository {
  /** Condiciones activas, ordenadas por displayOrder. */
  findCatalog(): Promise<MedicalCondition[]>;
  /** Incluye condiciones inactivas — usado al validar la historia médica contra el catálogo. */
  findByCodes(codes: string[]): Promise<MedicalCondition[]>;
}

export const MedicalConditionRepository = Symbol('IMedicalConditionRepository');
