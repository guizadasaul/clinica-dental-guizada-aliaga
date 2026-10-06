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
 * Los 4 estados con los que se reportan las citas (CLI-224). No son los de la
 * base tal cual:
 * - `confirmed`: confirmada cuya hora todavía no llegó.
 * - `attended`: confirmada cuya hora ya pasó (no hay check-in: si el doctor
 *   no la marcó "No asistió", se toma como atendida), o `attended`.
 * - `cancelled` y `no_show`, tal cual.
 * `held` y `expired` son pasos de la reserva online (el horario bloqueado
 * mientras se paga el QR de reserva, y la reserva que no se pagó): no son
 * citas de la clínica y no se cuentan.
 */
export type ReportedAppointmentStatus =
  'confirmed' | 'attended' | 'cancelled' | 'no_show';

export function reportedAppointmentStatus(
  status: string,
  appointmentDatetime: Date,
  now: Date,
): ReportedAppointmentStatus | null {
  switch (status) {
    case 'confirmed':
      return appointmentDatetime < now ? 'attended' : 'confirmed';
    case 'attended':
    case 'cancelled':
    case 'no_show':
      return status;
    default:
      return null;
  }
}

/** Conteo de citas por ReportedAppointmentStatus en el rango. */
export type AppointmentStatusCounts = Record<string, number>;

export interface DoctorOperationalRow {
  /** users.id del doctor. */
  doctorId: string;
  doctorName: string | null;
  appointmentsByStatus: AppointmentStatusCounts;
  /** confirmed + attended + no_show: una cita cancelada no ocupó la agenda (CLI-154). */
  totalAppointments: number;
  /** Pacientes cuyo assigned_doctor_id es este doctor y se crearon en el rango. */
  newPatients: number;
  /** Capacidad teórica de slots del doctor en el rango, según doctor_schedule_blocks (ClinicSchedule.buildSlotsForDate). */
  theoreticalSlots: number;
  /** Horarios tomados: confirmed + attended — numerador de occupancyRate. */
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
