/**
 * Conteo de turnos por estado, tal como lo devuelve el backend — hoy solo
 * puede traer 'held'/'confirmed'/'expired' pobladas (ningún flujo transiciona
 * una cita a 'attended', no hay check-in). Ver PrismaReportsRepository.
 */
export type AppointmentStatusCounts = Record<string, number>;

export interface DoctorOperationalRow {
  doctorId: string;
  doctorName: string | null;
  appointmentsByStatus: AppointmentStatusCounts;
  totalAppointments: number;
  newPatients: number;
  theoreticalSlots: number;
  confirmedAppointments: number;
  /** Fracción 0..1 — confirmedAppointments / theoreticalSlots. */
  occupancyRate: number;
}

export interface OperationalReport {
  from: string;
  to: string;
  doctors: DoctorOperationalRow[];
}

export interface DoctorFinancialRow {
  /** null = pagos/saldos de pacientes sin doctor asignado. */
  doctorId: string | null;
  doctorName: string | null;
  collected: number;
  pending: number;
}

export interface FinancialReport {
  from: string;
  to: string;
  doctors: DoctorFinancialRow[];
}
