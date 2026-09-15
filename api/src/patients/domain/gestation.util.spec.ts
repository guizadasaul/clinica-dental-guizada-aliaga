import { gestationTrimesterFor } from './gestation.util';

const ASOF = new Date('2026-09-15T00:00:00.000Z');

function daysAgo(days: number): Date {
  return new Date(ASOF.getTime() - days * 86_400_000);
}

describe('gestationTrimesterFor', () => {
  it('returns 1 at week 0 (LMP is today)', () => {
    expect(gestationTrimesterFor(ASOF, ASOF)).toBe(1);
  });

  it('returns 1 at the boundary of week 13', () => {
    expect(gestationTrimesterFor(daysAgo(13 * 7), ASOF)).toBe(1);
  });

  it('returns 2 just past week 13', () => {
    expect(gestationTrimesterFor(daysAgo(13 * 7 + 1), ASOF)).toBe(2);
  });

  it('returns 2 at the boundary of week 27', () => {
    expect(gestationTrimesterFor(daysAgo(27 * 7), ASOF)).toBe(2);
  });

  it('returns 3 just past week 27', () => {
    expect(gestationTrimesterFor(daysAgo(27 * 7 + 1), ASOF)).toBe(3);
  });

  it('returns 3 at the boundary of week 42', () => {
    expect(gestationTrimesterFor(daysAgo(42 * 7), ASOF)).toBe(3);
  });

  it('returns null past week 42 (likely no longer pregnant or stale data)', () => {
    expect(gestationTrimesterFor(daysAgo(42 * 7 + 1), ASOF)).toBeNull();
  });

  it('returns null for a future LMP date', () => {
    expect(gestationTrimesterFor(daysAgo(-1), ASOF)).toBeNull();
  });
});
