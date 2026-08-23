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
}
