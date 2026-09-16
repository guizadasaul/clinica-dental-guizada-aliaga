import { DoctorAppointmentsController } from './doctor-appointments.controller';
import { AppointmentsService } from '../../application/appointments.service';
import { User } from '../../../auth/domain/User';
import { UserRole } from '../../../auth/domain/value-objects/UserRole';
import { ListAppointmentsQueryDto } from './dto/list-appointments-query.dto';

function fakeDoctor(id: string): User {
  return new User(
    id,
    'auth-uid',
    'doctor@example.com',
    UserRole.ODONTOLOGIST,
    'Dra. Ejemplo',
    null,
    null,
    true,
    new Date(),
    new Date(),
  );
}

describe('DoctorAppointmentsController', () => {
  let controller: DoctorAppointmentsController;
  const mockService = { getAgenda: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new DoctorAppointmentsController(
      mockService as unknown as AppointmentsService,
    );
  });

  // CLI-57: la agenda tiene que ser SIEMPRE la del doctor logueado — el
  // query ya no tiene doctorId (ListAppointmentsQueryDto), así que ni
  // aunque un cliente lo mande hay forma de que llegue al service.
  it('derives doctorId from the authenticated user, not from the query', async () => {
    const doctor = fakeDoctor('doctor-a');
    const query: ListAppointmentsQueryDto = { status: 'confirmed' };

    await controller.findForAgenda(doctor, query);

    expect(mockService.getAgenda).toHaveBeenCalledWith(
      expect.objectContaining({ doctorId: 'doctor-a', status: 'confirmed' }),
    );
  });

  it('scopes different requests to their own authenticated doctor', async () => {
    await controller.findForAgenda(fakeDoctor('doctor-a'), {});
    await controller.findForAgenda(fakeDoctor('doctor-b'), {});

    expect(mockService.getAgenda).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ doctorId: 'doctor-a' }),
    );
    expect(mockService.getAgenda).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ doctorId: 'doctor-b' }),
    );
  });
});
