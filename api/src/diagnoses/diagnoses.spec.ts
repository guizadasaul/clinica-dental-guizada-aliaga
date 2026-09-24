import { PrismaDiagnosesRepository } from './infrastructure/persistence/prisma-diagnoses.repository';
import { DiagnosesService } from './application/diagnoses.service';
import { DiagnosesController } from './infrastructure/http/diagnoses.controller';
import type { IDiagnosisRepository } from './domain/DiagnosisRepository';

function diagnosisRow(code: string, overrides: Record<string, unknown> = {}) {
  return {
    id: `id-${code}`,
    category_id: 'cat-caries',
    code,
    name: code,
    scope: 'single_tooth',
    modifier: 'none',
    color: '#b91c1c',
    display_order: 0,
    ...overrides,
  };
}

describe('catálogo de diagnósticos', () => {
  describe('PrismaDiagnosesRepository', () => {
    const prisma = {
      diagnosis_categories: { findMany: jest.fn() },
      diagnoses: { findMany: jest.fn() },
    };
    const repo = new PrismaDiagnosesRepository(prisma as never);

    beforeEach(() => jest.clearAllMocks());

    it('findCatalog agrupa por categoría y oculta las categorías sin diagnósticos activos', async () => {
      prisma.diagnosis_categories.findMany.mockResolvedValue([
        {
          id: 'cat-caries',
          code: 'caries',
          name: 'Caries',
          display_order: 0,
          diagnoses: [diagnosisRow('caries_primer_grado')],
        },
        {
          id: 'cat-vacia',
          code: 'vacia',
          name: 'Vacía',
          display_order: 1,
          diagnoses: [],
        },
      ]);

      await expect(repo.findCatalog()).resolves.toEqual([
        {
          id: 'cat-caries',
          code: 'caries',
          name: 'Caries',
          displayOrder: 0,
          diagnoses: [
            {
              id: 'id-caries_primer_grado',
              categoryId: 'cat-caries',
              code: 'caries_primer_grado',
              name: 'caries_primer_grado',
              scope: 'single_tooth',
              modifier: 'none',
              color: '#b91c1c',
              displayOrder: 0,
            },
          ],
        },
      ]);
      expect(prisma.diagnosis_categories.findMany).toHaveBeenCalledWith({
        orderBy: { display_order: 'asc' },
        include: {
          diagnoses: {
            where: { is_active: true },
            orderBy: { display_order: 'asc' },
          },
        },
      });
    });

    it('findByCodes busca por código', async () => {
      prisma.diagnoses.findMany.mockResolvedValue([diagnosisRow('fractura')]);

      await expect(repo.findByCodes(['fractura'])).resolves.toMatchObject([
        { code: 'fractura' },
      ]);
      expect(prisma.diagnoses.findMany).toHaveBeenCalledWith({
        where: { code: { in: ['fractura'] } },
      });
    });

    it('findByCodes sin códigos no consulta la base', async () => {
      await expect(repo.findByCodes([])).resolves.toEqual([]);
      expect(prisma.diagnoses.findMany).not.toHaveBeenCalled();
    });
  });

  it('el service y el controller exponen el catálogo', async () => {
    const repo = {
      findCatalog: jest.fn().mockResolvedValue(['catálogo']),
    } as unknown as IDiagnosisRepository;
    const controller = new DiagnosesController(new DiagnosesService(repo));

    await expect(controller.findCatalog()).resolves.toEqual(['catálogo']);
  });
});
