import { examLegendItems, examToothColorMap, type PaintableFinding } from './odontogram-paint.util';

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

  it('examLegendItems: una entrada por categoría presente, sin repetidos', () => {
    expect(examLegendItems(FINDINGS)).toEqual([
      { name: 'Caries dentales', color: '#dc2626' },
      { name: 'Restauraciones / obturaciones', color: '#2563eb' },
      { name: 'Alteraciones de tejidos blandos', color: '#db2777' },
    ]);
  });
});
