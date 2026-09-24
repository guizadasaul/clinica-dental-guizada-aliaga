import { Prisma } from '@prisma/client';
import { PrismaTreatmentsRepository } from './prisma-treatments.repository';
import { TreatmentMapper } from './treatment.mapper';

describe('PrismaTreatmentsRepository', () => {
  const treatments = {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  };
  const repo = new PrismaTreatmentsRepository({ treatments } as never);
  const ROW = { id: 'treatment-1' };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(TreatmentMapper, 'toDomain').mockReturnValue('mapped' as never);
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  it('findActive trae solo los activos, por orden de categoría y después propio', async () => {
    treatments.findMany.mockResolvedValue([ROW, ROW]);

    await expect(repo.findActive()).resolves.toEqual(['mapped', 'mapped']);
    expect(treatments.findMany).toHaveBeenCalledWith({
      where: { is_active: true },
      include: { treatment_categories: true },
      orderBy: [
        { treatment_categories: { display_order: 'asc' } },
        { display_order: 'asc' },
      ],
    });
  });

  it.each([
    ['findById', 'findUnique', () => repo.findById('treatment-1')],
    [
      'findDefaultConsultation',
      'findFirst',
      () => repo.findDefaultConsultation(),
    ],
  ] as const)('%s mapea la fila o devuelve null', async (_, query, call) => {
    treatments[query].mockResolvedValueOnce(ROW).mockResolvedValueOnce(null);

    await expect(call()).resolves.toBe('mapped');
    await expect(call()).resolves.toBeNull();
  });

  it('findDefaultConsultation busca la marcada como consulta por defecto', async () => {
    treatments.findFirst.mockResolvedValue(null);

    await repo.findDefaultConsultation();

    expect(treatments.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { is_default_consultation: true } }),
    );
  });

  describe('create', () => {
    const base = {
      code: 'limpieza',
      name: 'Limpieza',
      basePrice: 150,
      applicationType: 'full_mouth' as const,
      currency: 'BOB',
      categoryCode: 'preventiva',
    };

    it('aplica los defaults y conecta la categoría por código', async () => {
      treatments.create.mockResolvedValue(ROW);

      await expect(repo.create(base)).resolves.toBe('mapped');
      expect(treatments.create).toHaveBeenCalledWith({
        data: {
          code: 'limpieza',
          name: 'Limpieza',
          description: null,
          base_price: 150,
          estimated_minutes: 30,
          application_type: 'full_mouth',
          currency: 'BOB',
          display_order: 0,
          is_active: true,
          treatment_categories: { connect: { code: 'preventiva' } },
        },
        include: { treatment_categories: true },
      });
    });

    it('respeta los valores que vinieron', async () => {
      treatments.create.mockResolvedValue(ROW);

      await repo.create({
        ...base,
        description: 'Profilaxis',
        estimatedMinutes: 45,
        displayOrder: 3,
        isActive: false,
      });

      expect(treatments.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            description: 'Profilaxis',
            estimated_minutes: 45,
            display_order: 3,
            is_active: false,
          }) as object,
        }),
      );
    });
  });

  describe('update', () => {
    it('cambia la categoría solo si vino una', async () => {
      treatments.update.mockResolvedValue(ROW);

      await repo.update('treatment-1', { name: 'Limpieza profunda' });
      await repo.update('treatment-1', { categoryCode: 'periodoncia' });

      const [[first], [second]] = treatments.update.mock.calls as [
        { data: Record<string, unknown> },
      ][];
      expect(first.data.name).toBe('Limpieza profunda');
      expect(first.data.treatment_categories).toBeUndefined();
      expect(second.data.treatment_categories).toEqual({
        connect: { code: 'periodoncia' },
      });
    });

    it('devuelve null si el tratamiento no existe (P2025)', async () => {
      treatments.update.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('x', {
          code: 'P2025',
          clientVersion: 'test',
        }),
      );

      await expect(repo.update('missing', { name: 'x' })).resolves.toBeNull();
    });

    it('propaga cualquier otro error', async () => {
      const boom = new Error('connection lost');
      treatments.update.mockRejectedValue(boom);

      await expect(repo.update('treatment-1', { name: 'x' })).rejects.toBe(
        boom,
      );
    });
  });
});

describe('PrismaTreatmentsRepository.findUsageByDoctor (CLI-118)', () => {
  it('filtra por doctor, fecha y tratamientos activos; un grupo multi-pieza es un solo occurrence', async () => {
    const findMany = jest.fn().mockResolvedValue([
      {
        id: 'p-1',
        treatment_id: 't-1',
        application_group_id: null,
        procedure_date: new Date('2026-09-01'),
      },
      {
        id: 'p-2',
        treatment_id: 't-2',
        application_group_id: 'g-1',
        procedure_date: new Date('2026-09-02'),
      },
    ]);
    const repo = new PrismaTreatmentsRepository({
      tooth_procedures: { findMany },
    } as never);
    const since = new Date('2025-09-24');

    const usage = await repo.findUsageByDoctor('doctor-1', since);

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          performed_by: 'doctor-1',
          procedure_date: { gte: since },
          treatments: { is_active: true },
        },
      }),
    );
    expect(usage.map((u) => u.occurrence)).toEqual(['p-1', 'g-1']);
  });
});
