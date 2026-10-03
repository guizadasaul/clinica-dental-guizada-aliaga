import type { PatientBalance } from './PatientBalance';

export interface IFinancesReadRepository {
  /**
   * Todos los pacientes con ficha (los eliminados no), los últimos en recibir
   * un tratamiento primero y los que nunca recibieron uno al final (CLI-190).
   * Cada uno trae el saldo de su último presupuesto activo. `search` busca por
   * nombre y apellidos juntos, sin distinguir mayúsculas ni tildes.
   */
  listPatientsWithBalance(search?: string): Promise<PatientBalance[]>;
  /** Nombre completo del paciente, o null si no existe. */
  findPatientName(patientId: string): Promise<string | null>;
}

export const FinancesReadRepository = Symbol('IFinancesReadRepository');
