import type { DiagnosisScope } from '../../diagnoses/domain/DiagnosisScope';

/**
 * Un hallazgo del examen, con los datos del diagnóstico ya embebidos (no
 * solo el id) — el examen es un snapshot histórico inmutable, así que debe
 * mostrar el nombre/color/categoría vigentes al momento del guardado, no
 * los que el catálogo tenga hoy (un diagnóstico puede desactivarse después).
 */
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
