export interface Treatment {
  id: string;
  name: string;
  description: string | null;
  basePrice: number;
  estimatedMinutes: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ToothProcedure {
  id: string;
  patientId: string;
  toothNumber: number | null;
  applicationGroupId: string | null;
  treatmentId: string;
  priceCharged: number;
  procedureDate: string;
  surfaceVestibular: boolean;
  surfacePalatal: boolean;
  surfaceMesial: boolean;
  surfaceDistal: boolean;
  surfaceOcclusal: boolean;
  notes: string | null;
  performedBy: string;
  createdAt: string;
}
