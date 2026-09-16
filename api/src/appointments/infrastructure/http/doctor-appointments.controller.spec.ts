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

function fakeAdmin(id: string): User {
  return new User(
    id,
    'auth-uid-admin',
    'admin@example.com',
    UserRole.ADMIN,
    'Admin Ejemplo',
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

  // CLI-57: la agenda tiene que ser SIEMPRE la del doctor logueado, salvo
  // la excepción explícita de admin agregada en CLI-64 (ver más abajo).
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

  // CLI-64: un odontólogo que manda ?doctorId=<otro> tiene que seguir
  // viendo únicamente su propia agenda — el query param se ignora para
  // cualquier rol que no sea admin.
  it('ignores a doctorId query param sent by a non-admin odontologist', async () => {
    const doctor = fakeDoctor('doctor-a');
    const query: ListAppointmentsQueryDto = { doctorId: 'doctor-b' };

    await controller.findForAgenda(doctor, query);

    expect(mockService.getAgenda).toHaveBeenCalledWith(
      expect.objectContaining({ doctorId: 'doctor-a' }),
    );
  });

  // CLI-64: un admin SÍ puede pedir la agenda de cualquier doctor.
  it('lets an admin request another doctor agenda via doctorId', async () => {
    const admin = fakeAdmin('admin-1');
    const query: ListAppointmentsQueryDto = { doctorId: 'doctor-b' };

    await controller.findForAgenda(admin, query);

    expect(mockService.getAgenda).toHaveBeenCalledWith(
      expect.objectContaining({ doctorId: 'doctor-b' }),
    );
  });

  // CLI-64: si el admin no manda doctorId, ve su propia agenda (aunque un
  // admin típicamente no tiene citas propias, el fallback es consistente).
  it('falls back to the admin own id when no doctorId is sent', async () => {
    const admin = fakeAdmin('admin-1');

    await controller.findForAgenda(admin, {});

    expect(mockService.getAgenda).toHaveBeenCalledWith(
      expect.objectContaining({ doctorId: 'admin-1' }),
    );
  });
});
