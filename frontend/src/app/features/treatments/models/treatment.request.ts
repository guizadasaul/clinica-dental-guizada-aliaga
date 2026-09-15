import type { ToothSurfaceCode } from './treatment.model';

export interface ToothApplicationRequest {
  number: number;
  /** Códigos de tooth_surfaces (CLI-49) — p.ej. ['vestibular', 'occlusal']. */
  surfaces?: ToothSurfaceCode[];
}

export interface CreateToothProcedureRequest {
  /** Vacío para aplicaciones de arcada/boca completa o sin diente — ver TreatmentApplicationType. */
  teeth: ToothApplicationRequest[];
  treatmentId: string;
  priceCharged: number;
  /** Para aplicaciones por unidad/caja (elásticos, cera ortodóntica). */
  quantity?: number;
  procedureDate?: string;
  notes?: string;
}
