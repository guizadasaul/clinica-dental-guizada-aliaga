export interface CreateToothProcedureRequest {
  toothNumbers: number[];
  treatmentId: string;
  priceCharged: number;
  procedureDate?: string;
  surfaceVestibular?: boolean;
  surfacePalatal?: boolean;
  surfaceMesial?: boolean;
  surfaceDistal?: boolean;
  surfaceOcclusal?: boolean;
  notes?: string;
}
