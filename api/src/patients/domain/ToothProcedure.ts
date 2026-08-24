export interface ToothProcedure {
  id: string;
  patientId: string;
  toothNumber: number | null;
  applicationGroupId: string | null;
  treatmentId: string;
  priceCharged: number;
  /** Para aplicaciones por unidad/caja (CLI-41) — 1 para el resto. */
  quantity: number;
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
