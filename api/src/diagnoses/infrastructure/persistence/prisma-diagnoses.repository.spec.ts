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

describe('PrismaDiagnosesRepository.findCatalog (CLI-119)', () => {
  it('trae las sugerencias de tratamientos activos ordenadas por rank', async () => {
    const findMany = jest.fn().mockResolvedValue([
      {
        id: 'cat-1',
        code: 'caries',
        name: 'Caries dentales',
        display_order: 0,
        diagnoses: [
          {
            id: 'diag-1',
            category_id: 'cat-1',
            code: 'caries_segundo_grado',
            name: 'Caries de segundo grado',
            scope: 'single_tooth',
            modifier: 'black_class',
            color: '#dc2626',
            display_order: 0,
            is_active: true,
            diagnosis_treatment_suggestions: [{ treatment_id: 't-1' }],
          },
        ],
      },
    ]);
    const repo = new PrismaDiagnosesRepository({
      diagnosis_categories: { findMany },
    } as never);

    const catalog = await repo.findCatalog();

    const include = (findMany.mock.calls[0] as [{ include: unknown }])[0]
      .include;
    expect(include).toEqual({
      diagnoses: expect.objectContaining({
        include: {
          diagnosis_treatment_suggestions: {
            where: { treatments: { is_active: true } },
            orderBy: { rank: 'asc' },
            select: { treatment_id: true },
          },
        },
      }) as unknown,
    });
    expect(catalog[0].diagnoses[0].suggestedTreatmentIds).toEqual(['t-1']);
  });
});
