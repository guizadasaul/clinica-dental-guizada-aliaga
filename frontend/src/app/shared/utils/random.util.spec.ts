import { randomUnit } from './random.util';

describe('randomUnit', () => {
  it('devuelve números en [0, 1)', () => {
    for (let i = 0; i < 3000; i++) {
      const value = randomUnit();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('pide números al generador del navegador en lotes, no uno por llamada', () => {
    const spy = vi.spyOn(crypto, 'getRandomValues');

    for (let i = 0; i < 2048; i++) {
      randomUnit();
    }

    expect(spy.mock.calls.length).toBeGreaterThanOrEqual(1);
    expect(spy.mock.calls.length).toBeLessThanOrEqual(3);
    spy.mockRestore();
  });

  it('no repite siempre el mismo valor', () => {
    const values = new Set(Array.from({ length: 100 }, () => randomUnit()));

    expect(values.size).toBeGreaterThan(90);
  });
});
