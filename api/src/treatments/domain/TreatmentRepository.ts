import type { Treatment } from './Treatment';
import type { TreatmentScope } from './TreatmentScope';

export interface CreateTreatmentData {
  name: string;
  description?: string | null;
  basePrice: number;
  estimatedMinutes?: number;
  scope: TreatmentScope;
  currency: string;
  isActive?: boolean;
}

export type UpdateTreatmentData = Partial<CreateTreatmentData>;

export interface ITreatmentRepository {
  findActive(): Promise<Treatment[]>;
  findById(id: string): Promise<Treatment | null>;
  /** El treatment marcado is_default_consultation=true, usado como monto fijo de la reserva pública (CLI-11). */
  findDefaultConsultation(): Promise<Treatment | null>;
  create(data: CreateTreatmentData): Promise<Treatment>;
  /** null si no existe un treatment con ese id. */
  update(id: string, data: UpdateTreatmentData): Promise<Treatment | null>;
}

export const TreatmentRepository = Symbol('ITreatmentRepository');
