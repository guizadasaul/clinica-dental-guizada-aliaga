import { PrismaDoctorRepository } from './infrastructure/persistence/prisma-doctor.repository';
import { PrismaDoctorScheduleRepository } from './infrastructure/persistence/prisma-doctor-schedule.repository';
import { DoctorsController } from './infrastructure/http/doctors.controller';
import { DoctorMapper } from './infrastructure/persistence/doctor.mapper';
import type { IDoctorRepository } from './domain/DoctorRepository';

describe('doctores', () => {
  describe('PrismaDoctorRepository', () => {
    const prisma = {
      doctor_profiles: { findMany: jest.fn(), findUnique: jest.fn() },
    };
    const repo = new PrismaDoctorRepository(prisma as never);

    beforeEach(() => jest.clearAllMocks());

    it('findBookable trae solo reservables y activos, en su orden público', async () => {
      const spy = jest
        .spyOn(DoctorMapper, 'toDomain')
        .mockReturnValue('doctor' as never);
      prisma.doctor_profiles.findMany.mockResolvedValue([{}, {}]);

      await expect(repo.findBookable()).resolves.toEqual(['doctor', 'doctor']);
      expect(prisma.doctor_profiles.findMany).toHaveBeenCalledWith({
        where: { is_bookable: true, users: { is_active: true } },
        orderBy: { display_order: 'asc' },
        include: { users: true },
      });
      spy.mockRestore();
    });

    // CLI-63: dar de baja al usuario lo saca de la reserva aunque su perfil
    // siga marcado como reservable.
    it.each([
      [
        'reservable y activo',
        { is_bookable: true, users: { is_active: true } },
        true,
      ],
      [
        'reservable pero dado de baja',
        { is_bookable: true, users: { is_active: false } },
        false,
      ],
      [
        'no reservable',
        { is_bookable: false, users: { is_active: true } },
        false,
      ],
      ['sin perfil de doctor', null, false],
    ])('isBookable: %s → %s', async (_, record, expected) => {
      prisma.doctor_profiles.findUnique.mockResolvedValue(record);

      await expect(repo.isBookable('doctor-1')).resolves.toBe(expected);
      expect(prisma.doctor_profiles.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { user_id: 'doctor-1' } }),
      );
    });
  });

  it('PrismaDoctorScheduleRepository devuelve los bloques del doctor ordenados', async () => {
    const findMany = jest.fn().mockResolvedValue([
      { weekday: 1, start_time: '09:00', end_time: '12:00' },
      { weekday: 1, start_time: '15:00', end_time: '19:00' },
    ]);
    const repo = new PrismaDoctorScheduleRepository({
      doctor_schedule_blocks: { findMany },
    } as never);

    await expect(repo.findBlocksForDoctor('doctor-1')).resolves.toEqual([
      { weekday: 1, start: '09:00', end: '12:00' },
      { weekday: 1, start: '15:00', end: '19:00' },
    ]);
    expect(findMany).toHaveBeenCalledWith({
      where: { doctor_id: 'doctor-1' },
      orderBy: [{ weekday: 'asc' }, { start_time: 'asc' }],
    });
  });

  it('DoctorsController lista los doctores reservables', async () => {
    const repo = {
      findBookable: jest.fn().mockResolvedValue(['doctor']),
    } as unknown as IDoctorRepository;

    await expect(new DoctorsController(repo).findBookable()).resolves.toEqual([
      'doctor',
    ]);
  });
});
