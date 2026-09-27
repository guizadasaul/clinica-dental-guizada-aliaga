import type { PatientBalance } from './PatientBalance';

export interface IFinancesReadRepository {
  /**
   * Pacientes con un presupuesto activo (pendiente o con pago parcial, total
   * mayor a 0), el más recientemente movido primero. `search` filtra por
   * nombre o apellidos, sin distinguir mayúsculas.
   */
  listPatientsWithBalance(search?: string): Promise<PatientBalance[]>;
  /** Nombre completo del paciente, o null si no existe. */
  findPatientName(patientId: string): Promise<string | null>;
}

export const FinancesReadRepository = Symbol('IFinancesReadRepository');
