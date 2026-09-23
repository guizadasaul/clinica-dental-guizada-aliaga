import type { DiagnosisScope } from '../../diagnoses/models/diagnosis.model';

/**
 * `diagnosis` = diagnóstico desde cero (el primero, o uno nuevo cuando el
 * paciente vuelve tras un tiempo); `correction` = corrección del vigente (CLI-109).
 */
export type DentalExamKind = 'diagnosis' | 'correction';

export interface DentalExamFinding {
  id: string;
  diagnosisId: string;
  diagnosisCode: string;
  diagnosisName: string;
  diagnosisScope: DiagnosisScope;
  diagnosisColor: string;
  categoryName: string;
  toothNumber: number | null;
  toothType: string | null;
  applicationGroupId: string | null;
  modifierValue: string | null;
  description: string | null;
  xrayRequested: boolean;
  notes: string | null;
}

export interface DentalExam {
  id: string;
  patientId: string;
  version: number;
  kind: DentalExamKind;
  recordedBy: string;
  recordedByName: string | null;
  recordedAt: string;
  changeReason: string | null;
  notes: string | null;
  findings: DentalExamFinding[];
}

/** Metadata de una versión, sin los findings — para la lista del historial. */
export interface DentalExamVersionSummary {
  id: string;
  version: number;
  kind: DentalExamKind;
  recordedBy: string;
  recordedByName: string | null;
  recordedAt: string;
  changeReason: string | null;
  findingsCount: number;
}
