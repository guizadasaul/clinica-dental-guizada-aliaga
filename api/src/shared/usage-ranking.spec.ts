import { frequentSince, rankByUsage, type UsageEntry } from './usage-ranking';

const d = (iso: string) => new Date(iso);

describe('rankByUsage', () => {
  it('ordena por usos distintos y a igual cantidad por el más reciente', () => {
    const entries: UsageEntry[] = [
      { key: 'a', occurrence: '1', at: d('2026-01-01') },
      { key: 'a', occurrence: '2', at: d('2026-01-02') },
      { key: 'b', occurrence: '3', at: d('2026-03-01') },
      { key: 'c', occurrence: '4', at: d('2026-02-01') },
    ];

    expect(rankByUsage(entries, 10)).toEqual(['a', 'b', 'c']);
  });

  it('el mismo occurrence repetido cuenta una sola vez', () => {
    const entries: UsageEntry[] = [
      { key: 'a', occurrence: 'grupo-1', at: d('2026-01-01') },
      { key: 'a', occurrence: 'grupo-1', at: d('2026-01-01') },
      { key: 'a', occurrence: 'grupo-1', at: d('2026-01-01') },
      { key: 'b', occurrence: 'x', at: d('2025-12-01') },
      { key: 'b', occurrence: 'y', at: d('2025-12-02') },
    ];

    expect(rankByUsage(entries, 10)).toEqual(['b', 'a']);
  });

  it('respeta el límite y devuelve vacío sin usos', () => {
    const entries: UsageEntry[] = ['a', 'b', 'c'].map((key, i) => ({
      key,
      occurrence: key,
      at: d(`2026-01-0${i + 1}`),
    }));

    expect(rankByUsage(entries, 2)).toHaveLength(2);
    expect(rankByUsage([], 5)).toEqual([]);
  });
});

describe('frequentSince', () => {
  it('es un año antes de la fecha dada', () => {
    expect(frequentSince(d('2026-09-24T10:00:00Z')).toISOString()).toBe(
      '2025-09-24T10:00:00.000Z',
    );
  });
});
