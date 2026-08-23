import type { DiagnosisCategory } from './DiagnosisCategory';
import type { Diagnosis } from './Diagnosis';

export interface IDiagnosisRepository {
  /** Categorías activas con sus diagnósticos activos, ordenadas por displayOrder. */
  findCatalog(): Promise<DiagnosisCategory[]>;
  /** Incluye diagnósticos inactivos — usado al validar findings de un examen contra el catálogo. */
  findByCodes(codes: string[]): Promise<Diagnosis[]>;
}

export const DiagnosisRepository = Symbol('IDiagnosisRepository');
