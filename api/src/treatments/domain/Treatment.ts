import type { TreatmentApplicationType } from './TreatmentApplicationType';

export interface Treatment {
  id: string;
  code: string;
  name: string;
  description: string | null;
  basePrice: number;
  estimatedMinutes: number;
  applicationType: TreatmentApplicationType;
  currency: string;
  categoryId: string;
  categoryCode: string;
  categoryName: string;
  /** Color de la categoría — pinta el diente tratado en el odontograma (CLI-107). */
  categoryColor: string;
  displayOrder: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface TreatmentCategory {
  id: string;
  code: string;
  name: string;
  displayOrder: number;
  color: string;
}
