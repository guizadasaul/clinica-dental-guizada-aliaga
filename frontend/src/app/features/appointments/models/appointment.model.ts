export interface AppointmentAgendaItem {
  id: string;
  appointmentDatetime: string;
  status: string;
  patientId: string | null;
  patientFirstName: string | null;
  patientLastNamePaternal: string | null;
  patientPhone: string | null;
  patientEmail: string | null;
  guestFirstName: string | null;
  guestLastNamePaternal: string | null;
  guestPhone: string | null;
  /** Doctor del turno (CLI-110) — la agenda común lo muestra con su color. */
  doctorId: string;
  doctorName: string | null;
  doctorColor: string | null;
  /** CLI-148: duración real (la agenda dibuja el turno con este alto). */
  durationMinutes: number;
  /** public_web | whatsapp | doctor (agendada por el doctor desde su agenda). */
  source: string;
  treatmentId: string | null;
  treatmentName: string | null;
  notes: string | null;
  /** CLI-149: solo si status = 'cancelled'. */
  cancelledAt: string | null;
}

/** Bloque del horario de atención del doctor (CLI-148, GET /appointments/my-schedule). */
export interface DoctorScheduleBlock {
  /** 0 = domingo … 6 = sábado. */
  weekday: number;
  /** "HH:MM", hora de Bolivia. */
  start: string;
  end: string;
}

/** Cita vista por el propio paciente (CLI-153, GET /patients/me/appointments): sin pagos ni datos de otros. */
export interface PatientAppointment {
  id: string;
  appointmentDatetime: string;
  durationMinutes: number;
  doctorName: string | null;
  treatmentName: string | null;
  /** CLI-209: `confirmed`/`attended` = visita; `no_show` = el doctor marcó que no vino. */
  status: string;
}

/** Horario que el doctor aparta de su agenda (CLI-195): emergencia, curso, etc. GET /appointments/blocks. */
export interface TimeBlock {
  id: string;
  doctorId: string;
  /** ISO. */
  startsAt: string;
  endsAt: string;
  reason: string | null;
}
