/** Un fármaco que el paciente toma actualmente (CLI-50) — reemplaza el texto libre current_medications. */
export interface PatientMedication {
  id: string;
  drugName: string;
  dose: string | null;
  frequency: string | null;
  startedAt: Date | null;
}
