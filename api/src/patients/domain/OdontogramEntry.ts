export interface OdontogramEntry {
  id: string;
  patientId: string;
  toothNumber: number;
  toothType: string;
  toothCondition: string;
  diagnosisDescription: string;
  xrayRequested: boolean;
  treatmentId?: string;
  customPrice?: number;
  entryDate: Date;
  notes?: string;
  createdAt: Date;
}
