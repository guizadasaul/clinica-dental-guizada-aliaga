export interface AppointmentAgendaItem {
  id: string;
  appointmentDatetime: string;
  status: string;
  patientId: string | null;
  patientFirstName: string | null;
  patientLastNamePaternal: string | null;
  patientPhone: string | null;
  patientEmail: string | null;
  /** @deprecated Ver guestFirstName/guestLastNamePaternal (CLI-43). */
  guestFullName: string | null;
  guestFirstName: string | null;
  guestLastNamePaternal: string | null;
  guestPhone: string | null;
  /** Doctor del turno (CLI-110) — la agenda común lo muestra con su color. */
  doctorId: string;
  doctorName: string | null;
  doctorColor: string | null;
}
