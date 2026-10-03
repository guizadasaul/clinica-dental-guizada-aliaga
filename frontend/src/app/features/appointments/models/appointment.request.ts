/** CLI-148: cita que agenda el doctor desde su agenda (el doctor lo pone el backend). */
export interface CreateDoctorAppointmentRequest {
  patientId: string;
  /** ISO con offset de Bolivia, ej. 2026-10-05T09:00:00-04:00. */
  appointmentDatetime: string;
  treatmentId?: string;
  durationMinutes?: number;
  notes?: string;
}

/** CLI-149/151: nuevo horario de una cita confirmada propia. Notas: si viene, reemplaza (vacío las borra). */
export interface RescheduleDoctorAppointmentRequest {
  appointmentDatetime: string;
  durationMinutes?: number;
  notes?: string;
}

/** CLI-195: horario que el doctor aparta de su agenda (el doctor lo pone el backend). */
export interface CreateTimeBlockRequest {
  /** ISO con offset de Bolivia, ej. 2026-10-06T14:00:00-04:00. */
  startsAt: string;
  endsAt: string;
  reason?: string;
}
