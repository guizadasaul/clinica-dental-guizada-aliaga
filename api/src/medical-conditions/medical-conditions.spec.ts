import { PrismaMedicalConditionsRepository } from './infrastructure/persistence/prisma-medical-conditions.repository';
import { MedicalConditionsService } from './application/medical-conditions.service';
import { MedicalConditionsController } from './infrastructure/http/medical-conditions.controller';
import type { IMedicalConditionRepository } from './domain/MedicalConditionRepository';

const ROW = {
  id: 'condition-1',
  code: 'diabetes',
  name: 'Diabetes',
  display_order: 2,
};

describe('catálogo de condiciones médicas', () => {
  describe('PrismaMedicalConditionsRepository', () => {
    const prisma = { medical_conditions: { findMany: jest.fn() } };
    const repo = new PrismaMedicalConditionsRepository(prisma as never);

    beforeEach(() => jest.clearAllMocks());

    it('findCatalog trae las activas en orden', async () => {
      prisma.medical_conditions.findMany.mockResolvedValue([ROW]);

      await expect(repo.findCatalog()).resolves.toEqual([
        {
          id: 'condition-1',
          code: 'diabetes',
          name: 'Diabetes',
          displayOrder: 2,
        },
      ]);
      expect(prisma.medical_conditions.findMany).toHaveBeenCalledWith({
        where: { is_active: true },
        orderBy: { display_order: 'asc' },
      });
    });

    it('findByCodes busca por código', async () => {
      prisma.medical_conditions.findMany.mockResolvedValue([ROW]);

      await expect(repo.findByCodes(['diabetes'])).resolves.toHaveLength(1);
      expect(prisma.medical_conditions.findMany).toHaveBeenCalledWith({
        where: { code: { in: ['diabetes'] } },
      });
    });

    it('findByCodes sin códigos no consulta la base', async () => {
      await expect(repo.findByCodes([])).resolves.toEqual([]);
      expect(prisma.medical_conditions.findMany).not.toHaveBeenCalled();
    });
  });

  it('el service y el controller exponen el catálogo', async () => {
    const repo = {
      findCatalog: jest.fn().mockResolvedValue(['catálogo']),
    } as unknown as IMedicalConditionRepository;
    const controller = new MedicalConditionsController(
      new MedicalConditionsService(repo),
    );

    await expect(controller.findCatalog()).resolves.toEqual(['catálogo']);
  });
});
