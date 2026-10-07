import { DoctorSelfController } from './doctor-self.controller';
import type { AdminDoctorsService } from '../../application/admin-doctors.service';
import type { User } from '../../../auth/domain/User';

describe('DoctorSelfController (CLI-191)', () => {
  const service = { findById: jest.fn(), updateDoctor: jest.fn() };
  const controller = new DoctorSelfController(
    service as unknown as AdminDoctorsService,
  );
  const me = { id: 'doctor-1' } as User;

  beforeEach(() => jest.clearAllMocks());

  it('findMine lee siempre al doctor de la sesión', async () => {
    service.findById.mockResolvedValue({ id: 'doctor-1' });

    await expect(controller.findMine(me)).resolves.toEqual({ id: 'doctor-1' });
    expect(service.findById).toHaveBeenCalledWith('doctor-1');
  });

  it('updateMine edita al doctor de la sesión y solo manda los campos presentes', async () => {
    await controller.updateMine(me, {
      phone: '+59171234567',
      color: '#2563EB',
    });

    expect(service.updateDoctor).toHaveBeenCalledWith('doctor-1', {
      phone: '+59171234567',
      color: '#2563eb',
    });
  });

  it('updateMine pasa el horario como bloques planos', async () => {
    await controller.updateMine(me, {
      scheduleBlocks: [{ weekday: 1, start: '08:00', end: '12:00' }],
    });

    expect(service.updateDoctor).toHaveBeenCalledWith('doctor-1', {
      scheduleBlocks: [{ weekday: 1, start: '08:00', end: '12:00' }],
    });
  });

  it('updateMine no manda correo, reservable ni orden aunque el cuerpo los trajera', async () => {
    await controller.updateMine(me, {
      displayName: 'Dra. Ana',
      ...({ email: 'otro@x.com', isBookable: false } as object),
    });

    const [, data] = service.updateDoctor.mock.calls[0] as [string, object];
    expect(data).toEqual({ displayName: 'Dra. Ana' });
  });
});
