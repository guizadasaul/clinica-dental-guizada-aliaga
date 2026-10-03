import { PrismaFinancesReadRepository } from './prisma-finances-read.repository';
import type { PrismaService } from '../../../shared/prisma/prisma.service';

describe('PrismaFinancesReadRepository', () => {
  const prisma = {
    patients: { findMany: jest.fn(), findUnique: jest.fn() },
  };
  const repo = new PrismaFinancesReadRepository(
    prisma as unknown as PrismaService,
  );
  const SHARED = new Date('2026-09-27T12:00:00Z');

  function patient(
    id: string,
    first: string,
    paternal: string,
    overrides: {
      maternal?: string | null;
      createdAt?: string;
      lastTreatment?: string;
      quote?: { total: string; paid: string };
    } = {},
  ) {
    return {
      id,
      first_name: first,
      last_name_paternal: paternal,
      last_name_maternal: overrides.maternal ?? null,
      created_at: new Date(overrides.createdAt ?? '2026-01-01T00:00:00Z'),
      tooth_procedures: overrides.lastTreatment
        ? [{ created_at: new Date(overrides.lastTreatment) }]
        : [],
      quotes: overrides.quote
        ? [
            {
              id: `quote-${id}`,
              total_amount: overrides.quote.total,
              total_paid: overrides.quote.paid,
              shared_at: SHARED,
            },
          ]
        : [],
    };
  }

  beforeEach(() => jest.clearAllMocks());

  it('lista a todos los pacientes con ficha, también los sin presupuesto, una fila por paciente', async () => {
    prisma.patients.findMany.mockResolvedValue([
      patient('p1', 'Ana', 'Pérez', { quote: { total: '700', paid: '200.5' } }),
      patient('p2', 'Beto', 'Bravo'),
    ]);

    await expect(repo.listPatientsWithBalance()).resolves.toEqual([
      {
        patientId: 'p1',
        patientName: 'Ana Pérez',
        quoteId: 'quote-p1',
        totalAmount: 700,
        totalPaid: 200.5,
        balance: 499.5,
        sharedAt: SHARED,
        lastTreatmentAt: null,
      },
      {
        patientId: 'p2',
        patientName: 'Beto Bravo',
        quoteId: null,
        totalAmount: 0,
        totalPaid: 0,
        balance: 0,
        sharedAt: null,
        lastTreatmentAt: null,
      },
    ]);
  });

  it('pide solo fichas no eliminadas, con su último tratamiento y su presupuesto activo más reciente', async () => {
    prisma.patients.findMany.mockResolvedValue([]);

    await repo.listPatientsWithBalance();

    const [[args]] = prisma.patients.findMany.mock.calls as [
      [
        {
          where: unknown;
          select: {
            tooth_procedures: unknown;
            quotes: { where: unknown; orderBy: unknown; take: number };
          };
        },
      ],
    ];
    expect(args.where).toEqual({ deleted_at: null });
    expect(args.select.tooth_procedures).toEqual({
      orderBy: { created_at: 'desc' },
      take: 1,
      select: { created_at: true },
    });
    expect(args.select.quotes).toMatchObject({
      where: {
        status: { in: ['pending', 'partially_paid'] },
        total_amount: { gt: 0 },
      },
      orderBy: { updated_at: 'desc' },
      take: 1,
    });
  });

  it('ordena por último tratamiento, el más reciente primero, y los que nunca recibieron uno al final', async () => {
    prisma.patients.findMany.mockResolvedValue([
      patient('nunca-viejo', 'Nunca', 'Viejo', {
        createdAt: '2026-01-01T00:00:00Z',
      }),
      patient('ayer', 'Ayer', 'Atendido', {
        lastTreatment: '2026-10-02T10:00:00Z',
      }),
      patient('nunca-nuevo', 'Nunca', 'Nuevo', {
        createdAt: '2026-09-01T00:00:00Z',
      }),
      patient('hoy', 'Hoy', 'Atendido', {
        lastTreatment: '2026-10-03T10:00:00Z',
      }),
    ]);

    const rows = await repo.listPatientsWithBalance();

    expect(rows.map((r) => r.patientId)).toEqual([
      'hoy',
      'ayer',
      'nunca-nuevo',
      'nunca-viejo',
    ]);
    expect(rows[0].lastTreatmentAt).toEqual(new Date('2026-10-03T10:00:00Z'));
  });

  describe('búsqueda', () => {
    beforeEach(() => {
      prisma.patients.findMany.mockResolvedValue([
        patient('p1', 'Ana María', 'Pérez', { maternal: 'Gómez' }),
        patient('p2', 'Juan', 'Pérez'),
        patient('p3', 'Luis', 'Rojas'),
      ]);
    });

    it('encuentra por nombre y apellidos juntos, sin importar tildes ni mayúsculas', async () => {
      const rows = await repo.listPatientsWithBalance('  ANA perez ');

      expect(rows.map((r) => r.patientId)).toEqual(['p1']);
    });

    it('con una sola palabra encuentra a todos los que la tengan', async () => {
      const rows = await repo.listPatientsWithBalance('pérez');

      expect(rows.map((r) => r.patientId).sort()).toEqual(['p1', 'p2']);
    });

    it('sin coincidencias devuelve una lista vacía', async () => {
      await expect(repo.listPatientsWithBalance('zzz')).resolves.toEqual([]);
    });
  });

  it('findPatientName arma el nombre completo o devuelve null, sin contar fichas eliminadas', async () => {
    prisma.patients.findUnique
      .mockResolvedValueOnce({
        first_name: 'Ana',
        last_name_paternal: 'Pérez',
        last_name_maternal: 'Gómez',
      })
      .mockResolvedValueOnce(null);

    await expect(repo.findPatientName('patient-1')).resolves.toBe(
      'Ana Pérez Gómez',
    );
    await expect(repo.findPatientName('missing')).resolves.toBeNull();
    expect(prisma.patients.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'patient-1', deleted_at: null },
      }),
    );
  });
});
