export interface AppointmentAgendaItem {
  id: string;
  appointmentDatetime: string;
  status: string;
  patientId: string | null;
  patientFirstName: string | null;
  patientLastNamePaternal: string | null;
  patientPhone: string | null;
  patientEmail: string | null;
  guestFullName: string | null;
  guestPhone: string | null;
}
