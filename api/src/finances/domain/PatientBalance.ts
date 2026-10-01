/** Un paciente con presupuesto activo, para el selector de Finanzas (CLI-159). */
export interface PatientBalance {
  patientId: string;
  patientName: string;
  quoteId: string;
  totalAmount: number;
  totalPaid: number;
  balance: number;
  sharedAt: Date | null;
}
