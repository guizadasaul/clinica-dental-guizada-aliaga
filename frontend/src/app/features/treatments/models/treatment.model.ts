/**
 * A qué se aplica un tratamiento del catálogo (CLI-41). Reemplaza al
 * TreatmentScope de 6 valores — el resto de tipos NO admite selección de
 * dientes en el odontograma (ver shared/constants/dental-chart.constants.ts).
 */
export type TreatmentApplicationType =
  | 'general'
  | 'single_tooth'
  | 'multiple_teeth'
  | 'upper_arch'
  | 'lower_arch'
  | 'full_mouth'
  | 'soft_tissue'
  | 'frenulum'
  | 'prosthesis'
  | 'orthodontic'
  | 'unit'
  | 'box';

export type TreatmentCurrency = 'BOB' | 'USD';

/** Códigos del catálogo tooth_surfaces (CLI-49) — espejo del backend. */
export type ToothSurfaceCode =
  | 'vestibular'
  | 'palatal'
  | 'lingual'
  | 'mesial'
  | 'distal'
  | 'occlusal'
  | 'incisal';

export interface Treatment {
  id: string;
  code: string;
  name: string;
  description: string | null;
  basePrice: number;
  estimatedMinutes: number;
  applicationType: TreatmentApplicationType;
  currency: TreatmentCurrency;
  /** Equivalente en Bs. al tipo de cambio del día — null si currency es BOB o no hay tipo de cambio disponible (CLI-19). */
  basePriceBob: number | null;
  categoryId: string;
  categoryCode: string;
  categoryName: string;
  displayOrder: number;
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
  /** Para aplicaciones por unidad/caja (elásticos, cera ortodóntica) — 1 para el resto. */
  quantity: number;
  procedureDate: string;
  /** Conjunto de superficies marcadas (CLI-49) — [] si ninguna. */
  surfaces: ToothSurfaceCode[];
  notes: string | null;
  performedBy: string;
  createdAt: string;
}
