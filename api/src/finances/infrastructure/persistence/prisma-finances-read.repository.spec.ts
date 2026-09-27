import { PrismaFinancesReadRepository } from './prisma-finances-read.repository';
import type { PrismaService } from '../../../shared/prisma/prisma.service';

describe('PrismaFinancesReadRepository', () => {
  const prisma = {
    quotes: { findMany: jest.fn() },
    patients: { findUnique: jest.fn() },
  };
  const repo = new PrismaFinancesReadRepository(
    prisma as unknown as PrismaService,
  );
  const SHARED = new Date('2026-09-27T12:00:00Z');

  beforeEach(() => jest.clearAllMocks());

  it('lista los presupuestos activos con nombre completo y saldo', async () => {
    prisma.quotes.findMany.mockResolvedValue([
      {
        id: 'quote-1',
        patient_id: 'patient-1',
        total_amount: '700',
        total_paid: '200.5',
        shared_at: SHARED,
        patients: {
          first_name: 'Ana',
          last_name_paternal: 'Pérez',
          last_name_maternal: null,
        },
      },
    ]);

    await expect(repo.listPatientsWithBalance()).resolves.toEqual([
      {
        patientId: 'patient-1',
        patientName: 'Ana Pérez',
        quoteId: 'quote-1',
        totalAmount: 700,
        totalPaid: 200.5,
        balance: 499.5,
        sharedAt: SHARED,
      },
    ]);
    const [[args]] = prisma.quotes.findMany.mock.calls as [
      [{ where: Record<string, unknown> }],
    ];
    expect(args.where).toEqual({
      status: { in: ['pending', 'partially_paid'] },
      total_amount: { gt: 0 },
    });
  });

  it('la búsqueda filtra por nombre o apellidos sin distinguir mayúsculas', async () => {
    prisma.quotes.findMany.mockResolvedValue([]);

    await repo.listPatientsWithBalance('  pér ');

    const [[args]] = prisma.quotes.findMany.mock.calls as [
      [{ where: { patients: { OR: unknown[] } } }],
    ];
    expect(args.where.patients.OR).toContainEqual({
      last_name_paternal: { contains: 'pér', mode: 'insensitive' },
    });
  });

  it('findPatientName arma el nombre completo o devuelve null', async () => {
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
  });
});
