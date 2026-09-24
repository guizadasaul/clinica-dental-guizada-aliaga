import { DiagnosesService } from './diagnoses.service';
import type { IDiagnosisRepository } from '../domain/DiagnosisRepository';

describe('DiagnosesService', () => {
  const usageMock = jest.fn<
    ReturnType<IDiagnosisRepository['findUsageByDoctor']>,
    [string, Date]
  >();
  const repo: jest.Mocked<IDiagnosisRepository> = {
    findCatalog: jest.fn(),
    findByCodes: jest.fn(),
    findUsageByDoctor: usageMock,
  };
  const service = new DiagnosesService(repo);

  beforeEach(() => jest.clearAllMocks());

  it('findCatalog delega en el repositorio', async () => {
    repo.findCatalog.mockResolvedValue([]);

    await expect(service.findCatalog()).resolves.toEqual([]);
  });

  it('findFrequentCodes (CLI-118): un paciente cuenta una vez por diagnóstico aunque aparezca en varias versiones', async () => {
    repo.findUsageByDoctor.mockResolvedValue([
      { key: 'caries', occurrence: 'patient-1', at: new Date('2026-09-01') },
      { key: 'caries', occurrence: 'patient-1', at: new Date('2026-09-10') },
      {
        key: 'gingivitis',
        occurrence: 'patient-1',
        at: new Date('2026-08-01'),
      },
      {
        key: 'gingivitis',
        occurrence: 'patient-2',
        at: new Date('2026-08-02'),
      },
    ]);

    const codes = await service.findFrequentCodes('doctor-1', 1);

    expect(codes).toEqual(['gingivitis']);
    expect(usageMock.mock.calls[0][0]).toBe('doctor-1');
  });
});
