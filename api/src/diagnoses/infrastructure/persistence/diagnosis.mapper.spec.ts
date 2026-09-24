import { DiagnosisMapper } from './diagnosis.mapper';

type DiagnosisRecord = Parameters<typeof DiagnosisMapper.toDomain>[0];

const RECORD = {
  id: 'diag-1',
  category_id: 'cat-1',
  code: 'caries_segundo_grado',
  name: 'Caries de segundo grado',
  scope: 'single_tooth',
  modifier: 'black_class',
  color: '#dc2626',
  display_order: 1,
  is_active: true,
} as DiagnosisRecord;

describe('DiagnosisMapper (CLI-119)', () => {
  it('lleva los tratamientos sugeridos en el orden que vienen', () => {
    const diagnosis = DiagnosisMapper.toDomain({
      ...RECORD,
      diagnosis_treatment_suggestions: [
        { treatment_id: 't-2' },
        { treatment_id: 't-1' },
      ],
    });

    expect(diagnosis.suggestedTreatmentIds).toEqual(['t-2', 't-1']);
    expect(diagnosis.code).toBe('caries_segundo_grado');
  });

  it('sin sugerencias cargadas devuelve una lista vacía', () => {
    expect(DiagnosisMapper.toDomain(RECORD).suggestedTreatmentIds).toEqual([]);
  });
});
