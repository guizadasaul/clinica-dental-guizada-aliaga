import type { DiagnosisCategory } from './DiagnosisCategory';
import type { Diagnosis } from './Diagnosis';
import type { UsageEntry } from '../../shared/usage-ranking';

export interface IDiagnosisRepository {
  /** Categorías activas con sus diagnósticos activos, ordenadas por displayOrder. */
  findCatalog(): Promise<DiagnosisCategory[]>;
  /** Incluye diagnósticos inactivos — usado al validar findings de un examen contra el catálogo. */
  findByCodes(codes: string[]): Promise<Diagnosis[]>;
  /**
   * Diagnósticos activos que registró el doctor en exámenes desde `since`
   * (CLI-118). Cada versión del examen repite la lista completa de hallazgos, así que un
   * uso = (paciente, diagnóstico): un mismo diagnóstico del mismo paciente en
   * varias versiones cuenta una sola vez.
   */
  findUsageByDoctor(doctorId: string, since: Date): Promise<UsageEntry[]>;
}

export const DiagnosisRepository = Symbol('IDiagnosisRepository');
