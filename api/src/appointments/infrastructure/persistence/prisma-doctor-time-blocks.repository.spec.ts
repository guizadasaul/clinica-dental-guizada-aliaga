import { PrismaDoctorTimeBlocksRepository } from './prisma-doctor-time-blocks.repository';
import type { PrismaService } from '../../../shared/prisma/prisma.service';

// CLI-195
describe('PrismaDoctorTimeBlocksRepository', () => {
  const delegate = {
    create: jest.fn(),
    findMany: jest.fn(),
    deleteMany: jest.fn(),
  };
  const repo = new PrismaDoctorTimeBlocksRepository({
    doctor_time_blocks: delegate,
  } as unknown as PrismaService);
  const START = new Date('2026-10-06T18:00:00Z');
  const END = new Date('2026-10-06T20:00:00Z');
  const record = {
    id: 'block-1',
    doctor_id: 'doctor-1',
    starts_at: START,
    ends_at: END,
    reason: 'curso',
    created_at: new Date(),
  };

  beforeEach(() => jest.clearAllMocks());

  it('create guarda las columnas y devuelve el dominio', async () => {
    delegate.create.mockResolvedValue(record);

    await expect(
      repo.create({
        doctorId: 'doctor-1',
        startsAt: START,
        endsAt: END,
        reason: 'curso',
      }),
    ).resolves.toEqual({
      id: 'block-1',
      doctorId: 'doctor-1',
      startsAt: START,
      endsAt: END,
      reason: 'curso',
    });
    expect(delegate.create).toHaveBeenCalledWith({
      data: {
        doctor_id: 'doctor-1',
        starts_at: START,
        ends_at: END,
        reason: 'curso',
      },
    });
  });

  it('findOverlapping pide los del doctor que empiezan antes del fin y terminan después del inicio', async () => {
    delegate.findMany.mockResolvedValue([record]);
    const from = new Date('2026-10-06T00:00:00Z');
    const to = new Date('2026-10-13T00:00:00Z');

    const rows = await repo.findOverlapping('doctor-1', from, to);

    expect(rows).toHaveLength(1);
    expect(delegate.findMany).toHaveBeenCalledWith({
      where: {
        doctor_id: 'doctor-1',
        starts_at: { lt: to },
        ends_at: { gt: from },
      },
      orderBy: { starts_at: 'asc' },
    });
  });

  it('deleteOwn borra solo si el bloqueo es del doctor y dice si borró algo', async () => {
    delegate.deleteMany.mockResolvedValueOnce({ count: 1 });
    await expect(repo.deleteOwn('block-1', 'doctor-1')).resolves.toBe(true);
    expect(delegate.deleteMany).toHaveBeenCalledWith({
      where: { id: 'block-1', doctor_id: 'doctor-1' },
    });

    delegate.deleteMany.mockResolvedValueOnce({ count: 0 });
    await expect(repo.deleteOwn('block-1', 'otro')).resolves.toBe(false);
  });
});
