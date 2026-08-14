import type { TreatmentScope } from './TreatmentScope';

export interface Treatment {
  id: string;
  name: string;
  description: string | null;
  basePrice: number;
  estimatedMinutes: number;
  scope: TreatmentScope;
  currency: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}
