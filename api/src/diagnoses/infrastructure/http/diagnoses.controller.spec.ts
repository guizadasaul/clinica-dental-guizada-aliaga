import { DiagnosesController } from './diagnoses.controller';
import type { DiagnosesService } from '../../application/diagnoses.service';
import type { User } from '../../../auth/domain/User';

describe('DiagnosesController', () => {
  const service = {
    findCatalog: jest.fn().mockResolvedValue([]),
    findFrequentCodes: jest.fn().mockResolvedValue(['caries']),
  };
  const controller = new DiagnosesController(
    service as unknown as DiagnosesService,
  );
  const doctor = { id: 'doctor-1' } as User;

  beforeEach(() => jest.clearAllMocks());

  it('findCatalog delega en el service', async () => {
    await expect(controller.findCatalog()).resolves.toEqual([]);
  });

  it('findFrequent (CLI-118) usa el doctor autenticado y acota el límite', async () => {
    await expect(controller.findFrequent(doctor, 8)).resolves.toEqual([
      'caries',
    ]);
    await controller.findFrequent(doctor, 99);
    expect(service.findFrequentCodes.mock.calls).toEqual([
      ['doctor-1', 8],
      ['doctor-1', 20],
    ]);
  });
});
