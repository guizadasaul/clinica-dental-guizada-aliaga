import { OdontogramEntryMapper } from './odontogram-entry.mapper';

type Record = Parameters<typeof OdontogramEntryMapper.toDomain>[0];

const ENTRY_DATE = new Date('2026-09-20');
const CREATED = new Date('2026-09-20T12:00:00Z');

function row(overrides: Partial<Record> = {}): Record {
  return {
    id: 'entry-1',
    patient_id: 'patient-1',
    tooth_number: 16,
    tooth_type: 'permanent',
    tooth_condition: 'caries',
    diagnosis_description: null,
    treatment_id: null,
    custom_price: null,
    entry_date: ENTRY_DATE,
    notes: null,
    created_at: CREATED,
    ...overrides,
  };
}

describe('OdontogramEntryMapper.toDomain', () => {
  it('una entry del chart, sin tratamiento ni precio', () => {
    expect(OdontogramEntryMapper.toDomain(row())).toEqual({
      id: 'entry-1',
      patientId: 'patient-1',
      toothNumber: 16,
      toothType: 'permanent',
      toothCondition: 'caries',
      diagnosisDescription: null,
      treatmentId: undefined,
      customPrice: undefined,
      entryDate: ENTRY_DATE,
      notes: undefined,
      createdAt: CREATED,
    });
  });

  it('una entry generada por un tratamiento, con precio (Decimal → number) y notas', () => {
    const entry = OdontogramEntryMapper.toDomain(
      row({
        diagnosis_description: 'Caries oclusal',
        treatment_id: 'treatment-1',
        custom_price: '150.50' as unknown as Record['custom_price'],
        notes: 'revisar',
      }),
    );

    expect(entry).toMatchObject({
      diagnosisDescription: 'Caries oclusal',
      treatmentId: 'treatment-1',
      customPrice: 150.5,
      notes: 'revisar',
    });
  });
});
