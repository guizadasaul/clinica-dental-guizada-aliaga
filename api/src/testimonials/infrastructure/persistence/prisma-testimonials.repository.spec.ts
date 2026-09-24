import { Prisma } from '@prisma/client';
import { PrismaTestimonialsRepository } from './prisma-testimonials.repository';

const CREATED = new Date('2026-09-20T12:00:00Z');

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: 'testimonial-1',
    name: 'Ana',
    treatment: 'Limpieza',
    comment: 'Excelente atención',
    status: 'pending',
    created_at: CREATED,
    updated_at: CREATED,
    ...overrides,
  };
}

describe('PrismaTestimonialsRepository', () => {
  const testimonials = {
    create: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
  };
  const repo = new PrismaTestimonialsRepository({ testimonials } as never);

  beforeEach(() => jest.clearAllMocks());

  it('create guarda solo nombre, tratamiento y comentario (el estado lo pone la base)', async () => {
    testimonials.create.mockResolvedValue(row());

    await expect(
      repo.create({
        name: 'Ana',
        treatment: 'Limpieza',
        comment: 'Excelente atención',
      }),
    ).resolves.toEqual({
      id: 'testimonial-1',
      name: 'Ana',
      treatment: 'Limpieza',
      comment: 'Excelente atención',
      status: 'pending',
      createdAt: CREATED,
      updatedAt: CREATED,
    });
    expect(testimonials.create).toHaveBeenCalledWith({
      data: {
        name: 'Ana',
        treatment: 'Limpieza',
        comment: 'Excelente atención',
      },
    });
  });

  it('findApproved trae los aprobados, más nuevos primero', async () => {
    testimonials.findMany.mockResolvedValue([row({ status: 'approved' })]);

    await expect(repo.findApproved()).resolves.toMatchObject([
      { status: 'approved' },
    ]);
    expect(testimonials.findMany).toHaveBeenCalledWith({
      where: { status: 'approved' },
      orderBy: { created_at: 'desc' },
    });
  });

  it('findPending trae los pendientes, más viejos primero (cola de moderación)', async () => {
    testimonials.findMany.mockResolvedValue([row()]);

    await expect(repo.findPending()).resolves.toHaveLength(1);
    expect(testimonials.findMany).toHaveBeenCalledWith({
      where: { status: 'pending' },
      orderBy: { created_at: 'asc' },
    });
  });

  describe('updateStatus', () => {
    it('cambia el estado', async () => {
      testimonials.update.mockResolvedValue(row({ status: 'approved' }));

      await expect(
        repo.updateStatus('testimonial-1', 'approved'),
      ).resolves.toMatchObject({ status: 'approved' });
      expect(testimonials.update).toHaveBeenCalledWith({
        where: { id: 'testimonial-1' },
        data: { status: 'approved' },
      });
    });

    it('devuelve null si no existe (P2025)', async () => {
      testimonials.update.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('x', {
          code: 'P2025',
          clientVersion: 'test',
        }),
      );

      await expect(
        repo.updateStatus('missing', 'approved'),
      ).resolves.toBeNull();
    });

    it('propaga cualquier otro error', async () => {
      const boom = new Error('connection lost');
      testimonials.update.mockRejectedValue(boom);

      await expect(repo.updateStatus('testimonial-1', 'rejected')).rejects.toBe(
        boom,
      );
    });
  });
});
