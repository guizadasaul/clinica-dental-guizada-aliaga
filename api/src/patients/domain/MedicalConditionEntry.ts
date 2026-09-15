/** Una condición médica registrada para el paciente (CLI-50), con los datos del catálogo ya embebidos. */
export interface MedicalConditionEntry {
  code: string;
  name: string;
  diagnosedAt: Date | null;
  notes: string | null;
}
