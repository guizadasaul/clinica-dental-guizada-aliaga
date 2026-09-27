/** CLI-148: cita que agenda el doctor desde su agenda (el doctor lo pone el backend). */
export interface CreateDoctorAppointmentRequest {
  patientId: string;
  /** ISO con offset de Bolivia, ej. 2026-10-05T09:00:00-04:00. */
  appointmentDatetime: string;
  treatmentId?: string;
  durationMinutes?: number;
  notes?: string;
}
