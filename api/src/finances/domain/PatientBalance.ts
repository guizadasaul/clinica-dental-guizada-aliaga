/**
 * Un paciente en el selector de Finanzas (CLI-159, CLI-190). Aparecen todos los
 * pacientes con ficha; si tiene un presupuesto activo se resume en los campos
 * de abajo, si no `quoteId` es null y los montos son 0 ("Al día").
 */
export interface PatientBalance {
  patientId: string;
  patientName: string;
  /** Último presupuesto activo (pendiente o con pago parcial), o null. */
  quoteId: string | null;
  totalAmount: number;
  totalPaid: number;
  balance: number;
  sharedAt: Date | null;
  /** Cuándo recibió su último tratamiento; null si nunca recibió uno. */
  lastTreatmentAt: Date | null;
}
