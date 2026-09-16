/**
 * Parámetros ya normalizados que recibe el repositorio — `from`/`to` llegan
 * como Date (ReportsService los arma a partir de los YYYY-MM-DD del query),
 * `from` inclusive y `to` EXCLUSIVO (mismo criterio que AgendaFilters).
 */
export interface ReportParams {
  from: Date;
  to: Date;
  doctorId?: string;
}

/**
 * Conteo de turnos por estado en el rango. Los estados reales que hoy puede
 * tener una fila de `appointments` son `held`/`confirmed`/`expired` — no
 * existe ningún flujo que transicione una cita a `attended` (no hay
 * check-in), así que ese estado no aparece nunca poblado hoy. No se inventa
 * ese flujo acá: si en el futuro existiera, este mapa lo reflejaría solo.
 */
export type AppointmentStatusCounts = Record<string, number>;

export interface DoctorOperationalRow {
  /** users.id del doctor. */
  doctorId: string;
  doctorName: string | null;
  appointmentsByStatus: AppointmentStatusCounts;
  totalAppointments: number;
  /** Pacientes cuyo assigned_doctor_id es este doctor y se crearon en el rango. */
  newPatients: number;
  /** Capacidad teórica de slots del doctor en el rango, según doctor_schedule_blocks (ClinicSchedule.buildSlotsForDate). */
  theoreticalSlots: number;
  /** Turnos con status='confirmed' en el rango — numerador de occupancyRate. */
  confirmedAppointments: number;
  /** confirmedAppointments / theoreticalSlots. 0 si theoreticalSlots es 0 (evita división por cero). */
  occupancyRate: number;
}

export interface OperationalReport {
  /** YYYY-MM-DD, tal como vino en el query. */
  from: string;
  to: string;
  doctors: DoctorOperationalRow[];
}
