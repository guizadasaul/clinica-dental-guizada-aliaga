export interface ToothProcedure {
  id: string;
  patientId: string;
  toothNumber: number;
  treatmentId: string;
  priceCharged: number;
  procedureDate: Date;
  surfaceVestibular: boolean;
  surfacePalatal: boolean;
  surfaceMesial: boolean;
  surfaceDistal: boolean;
  surfaceOcclusal: boolean;
  notes: string | null;
  performedBy: string;
  createdAt: Date;
}
