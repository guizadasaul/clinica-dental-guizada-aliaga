import { appointmentPatientLabel } from './appointment-patient-label';
import type { AppointmentAgendaItem } from './appointment.model';

function item(overrides: Partial<AppointmentAgendaItem> = {}): AppointmentAgendaItem {
  return {
    id: 'appt-1',
    appointmentDatetime: '2026-09-24T13:00:00.000Z',
    status: 'confirmed',
    patientId: null,
    patientFirstName: null,
    patientLastNamePaternal: null,
    patientPhone: null,
    patientEmail: null,
    guestFirstName: null,
    guestLastNamePaternal: null,
    guestPhone: null,
    doctorId: 'doctor-1',
    doctorName: null,
    doctorColor: null,
    ...overrides,
  };
}

describe('appointmentPatientLabel', () => {
  it('usa el nombre del paciente registrado', () => {
    expect(
      appointmentPatientLabel(
        item({ patientFirstName: 'Ana', patientLastNamePaternal: 'Pérez', guestFirstName: 'Otro' }),
      ),
    ).toBe('Ana Pérez');
  });

  it('muestra solo el nombre si el paciente no tiene apellido paterno', () => {
    expect(appointmentPatientLabel(item({ patientFirstName: 'Ana' }))).toBe('Ana');
  });

  it('usa el nombre del invitado en una reserva pública', () => {
    expect(
      appointmentPatientLabel(item({ guestFirstName: 'Luis', guestLastNamePaternal: 'Rojas' })),
    ).toBe('Luis Rojas');
    expect(appointmentPatientLabel(item({ guestFirstName: 'Luis' }))).toBe('Luis');
  });

  it('avisa cuando no hay ningún nombre', () => {
    expect(appointmentPatientLabel(item())).toBe('Paciente sin datos');
  });
});
