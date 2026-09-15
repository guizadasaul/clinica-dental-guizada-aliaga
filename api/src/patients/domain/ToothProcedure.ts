import type { ToothSurfaceCode } from '../../shared/validators/tooth-surface.validator';

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
  /** Conjunto de superficies marcadas (CLI-49) — [] si ninguna. */
  surfaces: ToothSurfaceCode[];
  notes: string | null;
  performedBy: string;
  createdAt: Date;
}
