import { clinicToday, relativeDayLabel } from './clinic-date.util';

describe('clinicToday', () => {
  it('a las 21:00 de Bolivia sigue siendo el mismo día (en UTC ya es el siguiente)', () => {
    expect(clinicToday(new Date('2026-10-04T01:00:00Z'))).toBe('2026-10-03');
  });

  it('a la medianoche de Bolivia ya es el día siguiente', () => {
    expect(clinicToday(new Date('2026-10-04T04:00:00Z'))).toBe('2026-10-04');
  });
});

describe('relativeDayLabel (CLI-267)', () => {
  // Lunes 5/10 a las 10:00 en Bolivia.
  const NOW = new Date('2026-10-05T14:00:00Z');

  it('cuenta días de calendario en Bolivia, no horas', () => {
    expect(relativeDayLabel('2026-10-05T23:30:00Z', NOW)).toBe('Hoy'); // 19:30 del mismo día
    expect(relativeDayLabel('2026-10-06T03:30:00Z', NOW)).toBe('Hoy'); // 23:30 en Bolivia, ya mañana en UTC
    expect(relativeDayLabel('2026-10-06T12:00:00Z', NOW)).toBe('Mañana');
    expect(relativeDayLabel('2026-10-10T12:00:00Z', NOW)).toBe('En 5 días');
  });

  it('hacia atrás: ayer y hace N días', () => {
    expect(relativeDayLabel('2026-10-04T20:00:00Z', NOW)).toBe('Ayer');
    expect(relativeDayLabel('2026-10-01T20:00:00Z', NOW)).toBe('Hace 4 días');
  });
});
