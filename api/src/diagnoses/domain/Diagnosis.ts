import type { DiagnosisScope, DiagnosisModifier } from './DiagnosisScope';

export interface Diagnosis {
  id: string;
  categoryId: string;
  code: string;
  name: string;
  scope: DiagnosisScope;
  modifier: DiagnosisModifier;
  color: string;
  displayOrder: number;
  /** Tratamientos activos sugeridos para este diagnóstico, el más habitual primero (CLI-119). */
  suggestedTreatmentIds: string[];
}
