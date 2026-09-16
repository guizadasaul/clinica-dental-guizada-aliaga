export interface DoctorFinancialRow {
  /** null = pagos/saldos de pacientes sin doctor asignado (patients.assigned_doctor_id es nullable). */
  doctorId: string | null;
  doctorName: string | null;
  /** Suma de payments.amount con payment_date en el rango — nunca leído de quotes.total_paid (instrucción explícita de la issue). */
  collected: number;
  /** Suma, por cada quote con status != 'paid', de (total_amount - suma de sus payments.amount). No depende del rango de fechas: es el saldo pendiente actual, no algo que haya "pasado" en el rango. */
  pending: number;
}

export interface FinancialReport {
  from: string;
  to: string;
  doctors: DoctorFinancialRow[];
}
