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
 * tener una fila de `appointments` son `held`/`confirmed`/`expired` y, desde
 * CLI-149, `cancelled` (cancelada por el doctor) y, desde CLI-208, `no_show`
 * (el paciente no vino; sí ocupó la agenda, así que suma al total) — no
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
  /** Todos los estados salvo `cancelled` (CLI-154): una cita cancelada no ocupó la agenda. */
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

/**
 * Detalle de una cita cancelada (CLI-103) — el conteo vive en
 * appointmentsByStatus.cancelled; esto es el "quién, cuándo y por qué".
 */
export interface CancelledAppointmentRow {
  appointmentId: string;
  appointmentDatetime: Date;
  doctorId: string;
  doctorName: string | null;
  /** Paciente con ficha o, si fue una reserva web sin cuenta, el invitado. */
  patientName: string | null;
  cancelledAt: Date | null;
  cancelledByName: string | null;
  cancelReason: string | null;
}

export interface OperationalReport {
  /** YYYY-MM-DD, tal como vino en el query. */
  from: string;
  to: string;
  doctors: DoctorOperationalRow[];
  /** Citas canceladas cuyo turno caía en el rango, la más reciente primero. */
  cancellations: CancelledAppointmentRow[];
}
