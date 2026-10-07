import { NotFoundException } from '@nestjs/common';
import { PatientAppointmentsController } from './patient-appointments.controller';
import type { PatientsService } from '../../application/patients.service';
import type { AppointmentsService } from '../../../appointments/application/appointments.service';
import type { AuthenticatedUser } from '../../../auth/domain/AuthenticatedUser';

describe('PatientAppointmentsController (CLI-153)', () => {
  const patientsService = { findMyPatient: jest.fn() };
  const appointmentsService = {
    getPatientAppointments: jest.fn(),
    getPatientVisits: jest.fn(),
  };
  const controller = new PatientAppointmentsController(
    patientsService as unknown as PatientsService,
    appointmentsService as unknown as AppointmentsService,
  );
  const user = { uid: 'auth-uid-1' } as AuthenticatedUser;

  beforeEach(() => jest.clearAllMocks());

  it('devuelve las próximas citas del paciente de la sesión', async () => {
    const upcoming = [{ id: 'appt-1' }];
    patientsService.findMyPatient.mockResolvedValue({ id: 'patient-1' });
    appointmentsService.getPatientAppointments.mockResolvedValue(upcoming);

    await expect(controller.findMine(user, {})).resolves.toBe(upcoming);
    expect(patientsService.findMyPatient).toHaveBeenCalledWith('auth-uid-1');
    expect(appointmentsService.getPatientAppointments).toHaveBeenCalledWith(
      'patient-1',
      'upcoming',
      5,
    );
  });

  it('sin ficha propaga el 404, sin consultar citas', async () => {
    patientsService.findMyPatient.mockRejectedValue(
      new NotFoundException('No tienes un perfil de paciente registrado'),
    );

    await expect(controller.findMine(user, {})).rejects.toThrow(
      NotFoundException,
    );
    expect(appointmentsService.getPatientAppointments).not.toHaveBeenCalled();
  });

  // CLI-209
  it('con scope=past devuelve el registro de visitas del paciente de la sesión', async () => {
    const visits = [{ id: 'appt-0', status: 'no_show' }];
    patientsService.findMyPatient.mockResolvedValue({ id: 'patient-1' });
    appointmentsService.getPatientVisits.mockResolvedValue(visits);

    await expect(controller.findMine(user, { scope: 'past' })).resolves.toBe(
      visits,
    );
    expect(appointmentsService.getPatientVisits).toHaveBeenCalledWith(
      'patient-1',
    );
    expect(appointmentsService.getPatientAppointments).not.toHaveBeenCalled();
  });
});
