import { TreatmentsController } from './treatments.controller';
import { TreatmentsService } from '../../application/treatments.service';
import type { CreateTreatmentDto } from './dto/create-treatment.dto';

describe('TreatmentsController', () => {
  const service = {
    findActive: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  };
  const controller = new TreatmentsController(
    service as unknown as TreatmentsService,
  );
  const DTO: CreateTreatmentDto = {
    code: 'limpieza',
    name: 'Limpieza',
    description: 'Profilaxis',
    basePrice: 150,
    estimatedMinutes: 45,
    applicationType: 'full_mouth',
    currency: 'BOB',
    categoryCode: 'preventiva',
    displayOrder: 1,
    isActive: true,
  };

  beforeEach(() => jest.clearAllMocks());

  it('findAll lista los tratamientos activos', async () => {
    service.findActive.mockResolvedValue(['t']);

    await expect(controller.findAll()).resolves.toEqual(['t']);
  });

  it('create pasa todos los campos del DTO', async () => {
    await controller.create(DTO);

    expect(service.create).toHaveBeenCalledWith(DTO);
  });

  it('update pasa el id y los campos, con undefined en lo que no vino', async () => {
    await controller.update('treatment-1', { basePrice: 200 });

    expect(service.update).toHaveBeenCalledWith('treatment-1', {
      code: undefined,
      name: undefined,
      description: undefined,
      basePrice: 200,
      estimatedMinutes: undefined,
      applicationType: undefined,
      currency: undefined,
      categoryCode: undefined,
      displayOrder: undefined,
      isActive: undefined,
    });
  });
});
