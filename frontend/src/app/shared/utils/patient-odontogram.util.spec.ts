import { patientOdontogram, type PaintableProcedure } from './patient-odontogram.util';

const CATALOG = [
  { name: 'Caries', diagnoses: [{ color: '#dc2626' }] },
  { name: 'Sin diagnósticos', diagnoses: [] },
];

function procedure(overrides: Partial<PaintableProcedure>): PaintableProcedure {
  return {
    toothNumber: 16,
    procedureDate: '2026-10-01',
    createdAt: '2026-10-01T10:00:00Z',
    categoryCode: 'operatoria',
    categoryName: 'Operatoria dental',
    categoryColor: '#16a34a',
    ...overrides,
  };
}

describe('patientOdontogram (CLI-256)', () => {
  it('pinta el diagnóstico vigente y encima el último tratamiento de cada diente', () => {
    const result = patientOdontogram(
      CATALOG,
      [
        {
          toothNumber: 16,
          diagnosisColor: '#dc2626',
          categoryName: 'Caries',
          diagnosisName: 'Caries',
        },
        {
          toothNumber: 21,
          diagnosisColor: '#dc2626',
          categoryName: 'Caries',
          diagnosisName: 'Caries',
        },
      ],
      [
        procedure({
          procedureDate: '2026-10-02',
          categoryColor: '#2563eb',
          categoryCode: 'endo',
          categoryName: 'Endodoncia',
        }),
        procedure({ procedureDate: '2026-10-01' }),
      ],
    );

    expect(result.toothColor.get(21)).toBe('#dc2626');
    // El más nuevo pisa: la endodoncia del 2 de octubre.
    expect(result.toothColor.get(16)).toBe('#2563eb');
    expect(result.treatedTeeth).toEqual([16]);
    expect(result.toothNames.get(16)).toEqual(['Caries']);
  });

  it('la leyenda lista las categorías con diagnósticos y las de tratamientos que pintan algo', () => {
    const result = patientOdontogram(
      CATALOG,
      [],
      [
        procedure({}),
        procedure({ toothNumber: null, categoryCode: 'boca', categoryName: 'Boca completa' }),
      ],
    );

    expect(result.legendItems).toEqual([
      { name: 'Caries', color: '#dc2626', group: 'Diagnósticos' },
      { name: 'Operatoria dental', color: '#16a34a', group: 'Tratamientos' },
    ]);
  });

  it('sin datos devuelve un odontograma vacío', () => {
    const result = patientOdontogram([], [], []);

    expect(result.toothColor.size).toBe(0);
    expect(result.treatedTeeth).toEqual([]);
    expect(result.legendItems).toEqual([]);
  });
});
