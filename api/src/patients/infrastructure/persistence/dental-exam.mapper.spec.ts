import { DentalExamMapper } from './dental-exam.mapper';

type ExamRecord = Parameters<typeof DentalExamMapper.toDomain>[0];
type SummaryRecord = Parameters<typeof DentalExamMapper.toVersionSummary>[0];

const BASE = {
  id: 'exam-1',
  patient_id: 'patient-1',
  version: 2,
  recorded_by: 'doctor-1',
  recorded_at: new Date('2026-09-23T12:00:00Z'),
  change_reason: null,
  notes: null,
  users: { display_name: 'Dr. Saul' },
};

describe('DentalExamMapper', () => {
  it('toDomain lleva el tipo de versión (CLI-109)', () => {
    const exam = DentalExamMapper.toDomain({
      ...BASE,
      kind: 'diagnosis',
      dental_exam_findings: [],
    } as unknown as ExamRecord);

    expect(exam.kind).toBe('diagnosis');
    expect(exam.recordedByName).toBe('Dr. Saul');
    expect(exam.findings).toEqual([]);
  });

  it('toVersionSummary lleva el tipo de versión y la cantidad de hallazgos', () => {
    const summary = DentalExamMapper.toVersionSummary({
      ...BASE,
      kind: 'correction',
      _count: { dental_exam_findings: 3 },
    } as unknown as SummaryRecord);

    expect(summary).toMatchObject({
      version: 2,
      kind: 'correction',
      findingsCount: 3,
    });
  });

  it('toDomain mapea cada hallazgo con su diagnóstico y categoría', () => {
    const exam = DentalExamMapper.toDomain({
      ...BASE,
      kind: 'diagnosis',
      users: { display_name: null },
      dental_exam_findings: [
        {
          id: 'finding-1',
          diagnosis_id: 'diagnosis-1',
          tooth_number: 16,
          tooth_type: 'permanent',
          application_group_id: null,
          modifier_value: 'clase_ii',
          description: 'Caries oclusal',
          xray_requested: true,
          notes: null,
          diagnoses: {
            code: 'caries_segundo_grado',
            name: 'Caries de segundo grado',
            scope: 'single_tooth',
            color: '#b91c1c',
            diagnosis_categories: { name: 'Caries' },
          },
        },
      ],
    } as unknown as ExamRecord);

    expect(exam.recordedByName).toBeNull();
    expect(exam.findings).toEqual([
      {
        id: 'finding-1',
        diagnosisId: 'diagnosis-1',
        diagnosisCode: 'caries_segundo_grado',
        diagnosisName: 'Caries de segundo grado',
        diagnosisScope: 'single_tooth',
        diagnosisColor: '#b91c1c',
        categoryName: 'Caries',
        toothNumber: 16,
        toothType: 'permanent',
        applicationGroupId: null,
        modifierValue: 'clase_ii',
        description: 'Caries oclusal',
        xrayRequested: true,
        notes: null,
      },
    ]);
  });
});
