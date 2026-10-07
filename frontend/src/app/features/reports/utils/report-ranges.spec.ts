import { formatRange, presetRange } from './report-ranges';

describe('presetRange', () => {
  const today = new Date(2026, 9, 5, 21, 30);

  it.each([
    ['7d', { from: '2026-09-29', to: '2026-10-05' }],
    ['30d', { from: '2026-09-06', to: '2026-10-05' }],
    ['month', { from: '2026-10-01', to: '2026-10-05' }],
    ['prevMonth', { from: '2026-09-01', to: '2026-09-30' }],
  ] as const)('%s', (preset, expected) => {
    expect(presetRange(preset, today)).toEqual(expected);
  });

  it('el mes pasado de enero es diciembre del año anterior', () => {
    expect(presetRange('prevMonth', new Date(2026, 0, 15))).toEqual({ from: '2025-12-01', to: '2025-12-31' });
  });
});

describe('formatRange', () => {
  it('muestra el año una sola vez si no cambia', () => {
    const text = formatRange({ from: '2026-09-06', to: '2026-10-05' });
    expect(text).toMatch(/^6 sept?\.? – 5 oct\.? 2026$/);
  });

  it('muestra los dos años si el rango cruza de año', () => {
    expect(formatRange({ from: '2025-12-20', to: '2026-01-05' })).toContain('2025');
  });
});
