export interface OdontogramEntry {
  id: string;
  patientId: string;
  toothNumber: number;
  toothType: string;
  toothCondition: string;
  /** Solo tiene contenido en filas pre-CLI-40 — las filas nuevas (arcada/boca completa) no lo necesitan, ver comentario del modelo. */
  diagnosisDescription: string | null;
  treatmentId?: string;
  customPrice?: number;
  entryDate: Date;
  notes?: string;
  createdAt: Date;
}
