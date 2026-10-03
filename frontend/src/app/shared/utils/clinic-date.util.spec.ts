import { clinicToday } from './clinic-date.util';

describe('clinicToday', () => {
  it('a las 21:00 de Bolivia sigue siendo el mismo día (en UTC ya es el siguiente)', () => {
    expect(clinicToday(new Date('2026-10-04T01:00:00Z'))).toBe('2026-10-03');
  });

  it('a la medianoche de Bolivia ya es el día siguiente', () => {
    expect(clinicToday(new Date('2026-10-04T04:00:00Z'))).toBe('2026-10-04');
  });
});
