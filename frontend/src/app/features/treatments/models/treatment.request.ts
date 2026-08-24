export interface ToothApplicationRequest {
  number: number;
  surfaceVestibular?: boolean;
  surfacePalatal?: boolean;
  surfaceMesial?: boolean;
  surfaceDistal?: boolean;
  surfaceOcclusal?: boolean;
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
