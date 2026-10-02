/**
 * Conteo de turnos por estado, tal como lo devuelve el backend — hoy solo
 * puede traer 'held'/'confirmed'/'expired'/'cancelled' pobladas (ningún flujo
 * transiciona una cita a 'attended', no hay check-in). Ver PrismaReportsRepository.
 */
export type AppointmentStatusCounts = Record<string, number>;

export interface DoctorOperationalRow {
  doctorId: string;
  doctorName: string | null;
  appointmentsByStatus: AppointmentStatusCounts;
  /** Sin las canceladas (CLI-154): se informan en appointmentsByStatus.cancelled. */
  totalAppointments: number;
  newPatients: number;
  theoreticalSlots: number;
  confirmedAppointments: number;
  /** Fracción 0..1 — confirmedAppointments / theoreticalSlots. */
  occupancyRate: number;
}

/** Detalle de una cita cancelada (CLI-103): quién, cuándo y por qué. */
export interface CancelledAppointmentRow {
  appointmentId: string;
  appointmentDatetime: string;
  doctorId: string;
  doctorName: string | null;
  patientName: string | null;
  cancelledAt: string | null;
  cancelledByName: string | null;
  cancelReason: string | null;
}

export interface OperationalReport {
  from: string;
  to: string;
  doctors: DoctorOperationalRow[];
  /** Citas canceladas del rango, la más reciente primero (CLI-103). */
  cancellations: CancelledAppointmentRow[];
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
