import type { AppointmentAgendaItem } from './appointment.model';

/** Nombre a mostrar en un turno: el paciente registrado o, si es una reserva pública, el invitado. */
export function appointmentPatientLabel(a: AppointmentAgendaItem): string {
  if (a.patientFirstName) {
    return `${a.patientFirstName} ${a.patientLastNamePaternal ?? ''}`.trim();
  }
  if (a.guestFirstName) {
    return `${a.guestFirstName} ${a.guestLastNamePaternal ?? ''}`.trim();
  }
  return 'Paciente sin datos';
}
