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

    expect(summary).toMatchObject({ version: 2, kind: 'correction', findingsCount: 3 });
  });
});
