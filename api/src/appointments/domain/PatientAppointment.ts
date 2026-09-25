/**
 * Read model de una cita vista por el propio paciente (CLI-91, chatbot):
 * solo lo que le sirve al paciente, sin datos de otros pacientes ni del pago.
 */
export interface PatientAppointment {
  id: string;
  appointmentDatetime: Date;
  durationMinutes: number;
  doctorName: string | null;
  treatmentName: string | null;
}
