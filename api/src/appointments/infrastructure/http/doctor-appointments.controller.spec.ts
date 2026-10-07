import { DoctorAppointmentsController } from './doctor-appointments.controller';
import { AppointmentsService } from '../../application/appointments.service';
import { User } from '../../../auth/domain/User';
import { UserRole } from '../../../auth/domain/value-objects/UserRole';
import { ListAppointmentsQueryDto } from './dto/list-appointments-query.dto';
import { ROLES_KEY } from '../../../auth/infrastructure/roles.decorator';

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

/** Roles exigidos por el @Roles() de un método del controller. */
function rolesOf(method: keyof DoctorAppointmentsController): UserRole[] {
  const handler = Object.getOwnPropertyDescriptor(
    DoctorAppointmentsController.prototype,
    method,
  )?.value as object;
  return Reflect.getMetadata(ROLES_KEY, handler) as UserRole[];
}

describe('DoctorAppointmentsController', () => {
  let controller: DoctorAppointmentsController;
  const mockService = {
    getAgenda: jest.fn(),
    createByDoctor: jest.fn(),
    getDoctorSchedule: jest.fn(),
    rescheduleByDoctor: jest.fn(),
    cancelByDoctor: jest.fn(),
    markNoShow: jest.fn(),
    undoNoShow: jest.fn(),
  };

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

  // CLI-110: agenda común — scope=all no filtra por doctor, para odontólogos y admin.
  it('scope=all returns every doctor agenda for an odontologist', async () => {
    await controller.findForAgenda(fakeDoctor('doctor-a'), {
      scope: 'all',
      doctorId: 'doctor-b',
    });

    const filters = (mockService.getAgenda.mock.calls as unknown[][])[0][0] as {
      doctorId?: string;
    };
    expect(filters.doctorId).toBeUndefined();
  });

  it('scope=all also applies to an admin', async () => {
    await controller.findForAgenda(fakeAdmin('admin-1'), { scope: 'all' });

    const filters = (mockService.getAgenda.mock.calls as unknown[][])[0][0] as {
      doctorId?: string;
    };
    expect(filters.doctorId).toBeUndefined();
  });

  it('scope=mine keeps the own-agenda rule', async () => {
    await controller.findForAgenda(fakeDoctor('doctor-a'), { scope: 'mine' });

    expect(mockService.getAgenda).toHaveBeenCalledWith(
      expect.objectContaining({ doctorId: 'doctor-a' }),
    );
  });

  // CLI-148: los días del query son días de Bolivia — si no, la semana
  // lunes→lunes perdía las citas del domingo de 20:00 a 24:00.
  it('interprets from/to as clinic (La Paz) midnights, not UTC', async () => {
    await controller.findForAgenda(fakeDoctor('doctor-a'), {
      from: '2026-09-28',
      to: '2026-10-05',
    });

    expect(mockService.getAgenda).toHaveBeenCalledWith(
      expect.objectContaining({
        from: new Date('2026-09-28T04:00:00.000Z'),
        to: new Date('2026-10-05T04:00:00.000Z'),
      }),
    );
  });

  // CLI-148
  describe('createByDoctor', () => {
    it('agenda en la agenda del doctor autenticado', async () => {
      const dto = {
        patientId: 'patient-1',
        appointmentDatetime: '2026-10-05T09:00:00-04:00',
      };

      await controller.createByDoctor(fakeDoctor('doctor-a'), dto);

      expect(mockService.createByDoctor).toHaveBeenCalledWith('doctor-a', dto);
    });

    it('solo lo pueden usar odontólogos, no el admin', () => {
      const roles = rolesOf('createByDoctor');
      expect(roles).toEqual([UserRole.ODONTOLOGIST]);
    });
  });

  describe('getMySchedule', () => {
    it('devuelve el horario del doctor autenticado', async () => {
      await controller.getMySchedule(fakeDoctor('doctor-a'));

      expect(mockService.getDoctorSchedule).toHaveBeenCalledWith('doctor-a');
    });

    it('solo lo pueden usar odontólogos', () => {
      const roles = rolesOf('getMySchedule');
      expect(roles).toEqual([UserRole.ODONTOLOGIST]);
    });
  });

  // CLI-149
  describe('rescheduleByDoctor / cancelByDoctor', () => {
    it('reprograma dentro de la agenda del doctor autenticado', async () => {
      const dto = { appointmentDatetime: '2026-10-05T09:00:00-04:00' };

      await controller.rescheduleByDoctor(
        fakeDoctor('doctor-a'),
        'appt-1',
        dto,
      );

      expect(mockService.rescheduleByDoctor).toHaveBeenCalledWith(
        'doctor-a',
        'appt-1',
        dto,
      );
    });

    it('cancela dentro de la agenda del doctor autenticado, con el motivo', async () => {
      await controller.cancelByDoctor(fakeDoctor('doctor-a'), 'appt-1', {
        reason: 'no puede venir',
      });

      expect(mockService.cancelByDoctor).toHaveBeenCalledWith(
        'doctor-a',
        'appt-1',
        'no puede venir',
      );
    });

    it('solo los pueden usar odontólogos, no el admin', () => {
      expect(rolesOf('rescheduleByDoctor')).toEqual([UserRole.ODONTOLOGIST]);
      expect(rolesOf('cancelByDoctor')).toEqual([UserRole.ODONTOLOGIST]);
    });
  });

  // CLI-208
  describe('markNoShow / undoNoShow', () => {
    it('marca y deshace "No asistió" en la agenda del doctor autenticado', async () => {
      await controller.markNoShow(fakeDoctor('doctor-a'), 'appt-1');
      await controller.undoNoShow(fakeDoctor('doctor-a'), 'appt-1');

      expect(mockService.markNoShow).toHaveBeenCalledWith('doctor-a', 'appt-1');
      expect(mockService.undoNoShow).toHaveBeenCalledWith('doctor-a', 'appt-1');
    });

    it('solo los pueden usar odontólogos, no el admin', () => {
      expect(rolesOf('markNoShow')).toEqual([UserRole.ODONTOLOGIST]);
      expect(rolesOf('undoNoShow')).toEqual([UserRole.ODONTOLOGIST]);
    });
  });

  // CLI-195: horarios que el doctor aparta de su agenda.
  describe('horarios reservados', () => {
    const service = {
      createTimeBlock: jest.fn(),
      listTimeBlocks: jest.fn(),
      deleteTimeBlock: jest.fn(),
    };
    const blocksController = new DoctorAppointmentsController(
      service as unknown as AppointmentsService,
    );

    beforeEach(() => jest.clearAllMocks());

    it('crea siempre para el doctor de la sesión', async () => {
      const dto = {
        startsAt: '2026-10-06T14:00:00-04:00',
        endsAt: '2026-10-06T16:00:00-04:00',
        reason: 'curso',
      };

      await blocksController.createTimeBlock(fakeDoctor('doctor-a'), dto);

      expect(service.createTimeBlock).toHaveBeenCalledWith('doctor-a', dto);
    });

    it('lista los del doctor de la sesión con los días como medianoche de Bolivia', async () => {
      await blocksController.listTimeBlocks(fakeDoctor('doctor-a'), {
        from: '2026-10-05',
        to: '2026-10-12',
      });

      expect(service.listTimeBlocks).toHaveBeenCalledWith(
        'doctor-a',
        new Date('2026-10-05T00:00:00-04:00'),
        new Date('2026-10-12T00:00:00-04:00'),
      );
    });

    it('quita solo dentro de los propios', async () => {
      await blocksController.deleteTimeBlock(fakeDoctor('doctor-a'), 'block-1');

      expect(service.deleteTimeBlock).toHaveBeenCalledWith(
        'doctor-a',
        'block-1',
      );
    });

    it('solo los usan odontólogos, no el admin', () => {
      expect(rolesOf('createTimeBlock')).toEqual([UserRole.ODONTOLOGIST]);
      expect(rolesOf('listTimeBlocks')).toEqual([UserRole.ODONTOLOGIST]);
      expect(rolesOf('deleteTimeBlock')).toEqual([UserRole.ODONTOLOGIST]);
    });
  });
});
