import { diagnosisSuggestions } from './diagnosis-suggestions';

// Examen del 1/10 a las 10:00 en Bolivia.
const RECORDED_AT = '2026-10-01T14:00:00Z';
const SUGGESTED = new Map<string, readonly string[]>([
  ['caries', ['resina', 'amalgama']],
  ['pulpitis', ['endodoncia', 'resina']],
  ['gingivitis', ['limpieza']],
]);

const finding = (diagnosisCode: string, diagnosisName: string, toothNumber: number | null) => ({
  diagnosisCode,
  diagnosisName,
  toothNumber,
});

describe('diagnosisSuggestions (CLI-266)', () => {
  it('sin examen vigente no sugiere nada', () => {
    expect(diagnosisSuggestions(null, SUGGESTED, [], [])).toEqual([]);
  });

  it('un ítem por tratamiento sugerido con las piezas que lo piden, el más habitual primero', () => {
    const exam = {
      recordedAt: RECORDED_AT,
      findings: [
        finding('caries', 'Caries', 26),
        finding('pulpitis', 'Pulpitis', 36),
        finding('caries', 'Caries', 16),
        finding('gingivitis', 'Gingivitis', null),
      ],
    };

    expect(diagnosisSuggestions(exam, SUGGESTED, [], [])).toEqual([
      { key: 'resina:16-26-36', treatmentId: 'resina', toothNumbers: [16, 26, 36], diagnosisNames: ['Caries', 'Pulpitis'] },
      { key: 'endodoncia:36', treatmentId: 'endodoncia', toothNumbers: [36], diagnosisNames: ['Pulpitis'] },
      { key: 'limpieza:general', treatmentId: 'limpieza', toothNumbers: [], diagnosisNames: ['Gingivitis'] },
      { key: 'amalgama:16-26', treatmentId: 'amalgama', toothNumbers: [16, 26], diagnosisNames: ['Caries'] },
    ]);
  });

  it('deja afuera las piezas tratadas desde el día del examen, no las tratadas antes', () => {
    const exam = { recordedAt: RECORDED_AT, findings: [finding('caries', 'Caries', 16), finding('caries', 'Caries', 26)] };
    const procedures = [
      { treatmentId: 'resina', toothNumber: 16, procedureDate: '2026-10-01' },
      { treatmentId: 'resina', toothNumber: 26, procedureDate: '2026-09-30' },
    ];

    expect(diagnosisSuggestions(exam, SUGGESTED, procedures, []).map((s) => s.key)).toEqual([
      'resina:26',
      'amalgama:26',
    ]);
  });

  it('un diagnóstico general ya atendido desde el examen no se vuelve a sugerir', () => {
    const exam = { recordedAt: RECORDED_AT, findings: [finding('gingivitis', 'Gingivitis', null)] };
    const procedures = [{ treatmentId: 'limpieza', toothNumber: null, procedureDate: '2026-10-05' }];

    expect(diagnosisSuggestions(exam, SUGGESTED, procedures, [])).toEqual([]);
  });

  it('lo que ya está pendiente en el presupuesto no se repite', () => {
    const exam = {
      recordedAt: RECORDED_AT,
      findings: [finding('caries', 'Caries', 16), finding('caries', 'Caries', 26), finding('gingivitis', 'Gingivitis', null)],
    };
    const plan = [
      { treatmentId: 'resina', toothNumbers: [16] },
      { treatmentId: 'limpieza', toothNumbers: [] },
    ];

    expect(diagnosisSuggestions(exam, SUGGESTED, [], plan).map((s) => s.key)).toEqual([
      'resina:26',
      'amalgama:16-26',
    ]);
  });
});
