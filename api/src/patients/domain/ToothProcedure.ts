import type { ToothSurfaceCode } from '../../shared/validators/tooth-surface.validator';
import type { TreatmentApplicationType } from '../../treatments/domain/TreatmentApplicationType';

export interface ToothProcedure {
  id: string;
  patientId: string;
  toothNumber: number | null;
  applicationGroupId: string | null;
  treatmentId: string;
  /**
   * Del tratamiento aplicado (CLI-107) — el odontograma de tratamientos
   * pinta el diente con el color de la categoría, y los de arcada/boca
   * completa (sin toothNumber) se expanden a sus dientes por el tipo.
   */
  applicationType: TreatmentApplicationType;
  categoryCode: string;
  categoryName: string;
  categoryColor: string;
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
