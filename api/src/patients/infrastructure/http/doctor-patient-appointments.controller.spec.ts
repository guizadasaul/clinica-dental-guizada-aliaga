import { NotFoundException } from '@nestjs/common';
import { DoctorPatientAppointmentsController } from './doctor-patient-appointments.controller';
import type { PatientsService } from '../../application/patients.service';
import type { AppointmentsService } from '../../../appointments/application/appointments.service';

describe('DoctorPatientAppointmentsController (CLI-260)', () => {
  const patientsService = { assertPatientExists: jest.fn() };
  const appointmentsService = {
    getPatientAppointments: jest.fn(),
    getPatientVisits: jest.fn(),
  };
  const controller = new DoctorPatientAppointmentsController(
    patientsService as unknown as PatientsService,
    appointmentsService as unknown as AppointmentsService,
  );

  beforeEach(() => jest.clearAllMocks());

  it('devuelve las próximas citas y las visitas de la ficha pedida', async () => {
    patientsService.assertPatientExists.mockResolvedValue(undefined);
    appointmentsService.getPatientAppointments.mockResolvedValue([
      { id: 'a-2' },
    ]);
    appointmentsService.getPatientVisits.mockResolvedValue([{ id: 'a-1' }]);

    await expect(controller.findForPatient('patient-1')).resolves.toEqual({
      upcoming: [{ id: 'a-2' }],
      past: [{ id: 'a-1' }],
    });
    expect(appointmentsService.getPatientAppointments).toHaveBeenCalledWith(
      'patient-1',
      'upcoming',
      10,
    );
    expect(appointmentsService.getPatientVisits).toHaveBeenCalledWith(
      'patient-1',
    );
  });

  it('si la ficha no existe propaga el 404 sin consultar citas', async () => {
    patientsService.assertPatientExists.mockRejectedValue(
      new NotFoundException(),
    );

    await expect(controller.findForPatient('nope')).rejects.toThrow(
      NotFoundException,
    );
    expect(appointmentsService.getPatientVisits).not.toHaveBeenCalled();
  });
});
