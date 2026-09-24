import { PrismaDiagnosesRepository } from './prisma-diagnoses.repository';

describe('PrismaDiagnosesRepository.findUsageByDoctor (CLI-118)', () => {
  it('filtra por doctor, fecha y diagnósticos activos, y usa el paciente como occurrence', async () => {
    const findMany = jest.fn().mockResolvedValue([
      {
        diagnoses: { code: 'caries' },
        dental_exams: {
          patient_id: 'patient-1',
          recorded_at: new Date('2026-09-01'),
        },
      },
    ]);
    const repo = new PrismaDiagnosesRepository({
      dental_exam_findings: { findMany },
    } as never);
    const since = new Date('2025-09-24');

    const usage = await repo.findUsageByDoctor('doctor-1', since);

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          diagnoses: { is_active: true },
          dental_exams: {
            recorded_by: 'doctor-1',
            recorded_at: { gte: since },
          },
        },
      }),
    );
    expect(usage).toEqual([
      { key: 'caries', occurrence: 'patient-1', at: new Date('2026-09-01') },
    ]);
  });
});
