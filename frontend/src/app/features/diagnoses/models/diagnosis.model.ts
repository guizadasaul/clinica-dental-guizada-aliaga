export type DiagnosisScope = 'single_tooth' | 'multiple_teeth' | 'general';
export type DiagnosisModifier = 'none' | 'black_class' | 'mobility_grade';

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

export interface DiagnosisCategory {
  id: string;
  code: string;
  name: string;
  displayOrder: number;
  diagnoses: Diagnosis[];
}
