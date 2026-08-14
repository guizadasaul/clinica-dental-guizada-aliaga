export type TreatmentScope =
  | 'tooth'
  | 'multi_tooth'
  | 'upper_arch'
  | 'lower_arch'
  | 'full_mouth'
  | 'none';

export type TreatmentCurrency = 'BOB' | 'USD';

export interface Treatment {
  id: string;
  name: string;
  description: string | null;
  basePrice: number;
  estimatedMinutes: number;
  scope: TreatmentScope;
  currency: TreatmentCurrency;
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
