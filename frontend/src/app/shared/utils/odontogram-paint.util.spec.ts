import {
  examLegendItems,
  examToothColorMap,
  examToothNames,
  toothPaint,
  type PaintableFinding,
} from './odontogram-paint.util';

const FINDINGS: PaintableFinding[] = [
  { toothNumber: 16, diagnosisColor: '#dc2626', categoryName: 'Caries dentales' },
  { toothNumber: 16, diagnosisColor: '#2563eb', categoryName: 'Restauraciones / obturaciones' },
  { toothNumber: 36, diagnosisColor: '#dc2626', categoryName: 'Caries dentales' },
  { toothNumber: null, diagnosisColor: '#db2777', categoryName: 'Alteraciones de tejidos blandos' },
];

describe('odontogram-paint.util', () => {
  it('examToothColorMap: cada diente toma el color de su primer hallazgo e ignora los generales', () => {
    const map = examToothColorMap(FINDINGS);

    expect([...map.entries()]).toEqual([
      [16, '#dc2626'],
      [36, '#dc2626'],
    ]);
  });

  // CLI-179: misma regla en todas las pantallas, sin depender del orden.
  it('un diagnóstico de un solo diente gana al de varios dientes, aunque llegue después', () => {
    const findings: PaintableFinding[] = [
      { toothNumber: 16, diagnosisColor: '#0d9488', categoryName: 'Periodontal', diagnosisName: 'Periodontitis', applicationGroupId: 'g1' },
      { toothNumber: 17, diagnosisColor: '#0d9488', categoryName: 'Periodontal', diagnosisName: 'Periodontitis', applicationGroupId: 'g1' },
      { toothNumber: 16, diagnosisColor: '#dc2626', categoryName: 'Caries dentales', diagnosisName: 'Caries' },
    ];

    expect(examToothColorMap(findings).get(16)).toBe('#dc2626');
    expect(examToothColorMap(findings).get(17)).toBe('#0d9488');
    expect(examToothNames(findings).get(16)).toEqual(['Caries', 'Periodontitis']);
  });

  it('toothPaint no repite nombres y sin nombre usa la categoría', () => {
    const { names } = toothPaint([
      { toothNumber: 11, color: '#000', name: 'Fractura', grouped: false },
      { toothNumber: 11, color: '#111', name: 'Fractura', grouped: true },
    ]);
    expect(names.get(11)).toEqual(['Fractura']);
    expect(examToothNames(FINDINGS).get(16)).toEqual(['Caries dentales', 'Restauraciones / obturaciones']);
  });

  it('examLegendItems: una entrada por categoría presente, sin repetidos', () => {
    expect(examLegendItems(FINDINGS)).toEqual([
      { name: 'Caries dentales', color: '#dc2626' },
      { name: 'Restauraciones / obturaciones', color: '#2563eb' },
      { name: 'Alteraciones de tejidos blandos', color: '#db2777' },
    ]);
  });
});
