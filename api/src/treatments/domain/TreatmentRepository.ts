import type { Treatment } from './Treatment';

export interface ITreatmentRepository {
  findActive(): Promise<Treatment[]>;
  /** El treatment marcado is_default_consultation=true, usado como monto fijo de la reserva pública (CLI-11). */
  findDefaultConsultation(): Promise<Treatment | null>;
}

export const TreatmentRepository = Symbol('ITreatmentRepository');
