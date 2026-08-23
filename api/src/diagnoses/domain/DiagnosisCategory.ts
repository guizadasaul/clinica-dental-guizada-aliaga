import type { Diagnosis } from './Diagnosis';

export interface DiagnosisCategory {
  id: string;
  code: string;
  name: string;
  displayOrder: number;
  diagnoses: Diagnosis[];
}
