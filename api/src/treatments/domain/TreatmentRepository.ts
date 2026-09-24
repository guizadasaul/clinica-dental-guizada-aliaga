import type { Treatment } from './Treatment';
import type { TreatmentApplicationType } from './TreatmentApplicationType';

export interface CreateTreatmentData {
  code: string;
  name: string;
  description?: string | null;
  basePrice: number;
  estimatedMinutes?: number;
  applicationType: TreatmentApplicationType;
  currency: string;
  /** code de treatment_categories, no el id — el repositorio resuelve la relación. */
  categoryCode: string;
  displayOrder?: number;
  isActive?: boolean;
}

export type UpdateTreatmentData = Partial<CreateTreatmentData>;

import type { UsageEntry } from '../../shared/usage-ranking';

export interface ITreatmentRepository {
  findActive(): Promise<Treatment[]>;
  findById(id: string): Promise<Treatment | null>;
  /** El treatment marcado is_default_consultation=true, usado como monto fijo de la reserva pública (CLI-11). */
  findDefaultConsultation(): Promise<Treatment | null>;
  create(data: CreateTreatmentData): Promise<Treatment>;
  /** null si no existe un treatment con ese id. */
  update(id: string, data: UpdateTreatmentData): Promise<Treatment | null>;
  /**
   * Tratamientos activos que registró el doctor desde `since` (CLI-118), un
   * uso por fila — las filas de un mismo grupo multi-pieza comparten
   * `occurrence` y cuentan una sola vez.
   */
  findUsageByDoctor(doctorId: string, since: Date): Promise<UsageEntry[]>;
}

export const TreatmentRepository = Symbol('ITreatmentRepository');
