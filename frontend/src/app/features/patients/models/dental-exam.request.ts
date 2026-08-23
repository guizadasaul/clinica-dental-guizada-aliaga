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
  /** Requerido por la UI cuando ya existe una versión previa del examen. */
  changeReason?: string;
  notes?: string;
}
