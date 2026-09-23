import type { DentalExamKind } from './dental-exam.model';

export interface CreateDentalExamFindingRequest {
  diagnosisCode: string;
  /** Una pieza (single_tooth), varias (multiple_teeth), o vacío (general). */
  toothNumbers?: number[];
  modifierValue?: string;
  description?: string;
  xrayRequested?: boolean;
  notes?: string;
}

export interface CreateDentalExamRequest {
  findings: CreateDentalExamFindingRequest[];
  /** Diagnóstico nuevo vs. corrección del vigente (CLI-109) — sin valor, lo decide el backend. */
  kind?: DentalExamKind;
  /** Requerido por la UI cuando ya existe una versión previa del examen. */
  changeReason?: string;
  notes?: string;
}
