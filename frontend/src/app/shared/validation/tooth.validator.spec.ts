import { toothTypeFor, isFdiToothNumber } from './tooth.validator';

describe('toothTypeFor', () => {
  it.each([
    [11, 'permanent'],
    [18, 'permanent'],
    [21, 'permanent'],
    [38, 'permanent'],
    [48, 'permanent'],
    [51, 'deciduous'],
    [55, 'deciduous'],
    [61, 'deciduous'],
    [85, 'deciduous'],
  ])('diente %i → %s', (toothNumber, expected) => {
    expect(toothTypeFor(toothNumber)).toBe(expected);
  });

  // Códigos que un rango [11,85] desnudo dejaba pasar sin existir en ningún
  // cuadrante real.
  it.each([[19], [20], [39], [56], [79], [10], [86], [0], [1.5]])(
    'diente inexistente %p → null',
    (toothNumber) => {
      expect(toothTypeFor(toothNumber)).toBeNull();
    },
  );
});

describe('isFdiToothNumber', () => {
  it.each([[11], [18], [48], [51], [85]])('acepta el diente %i', (toothNumber) => {
    expect(isFdiToothNumber(toothNumber)).toBe(true);
  });

  it.each([[19], [20], [39], [56], [79], [0], [100]])('rechaza el diente %i', (toothNumber) => {
    expect(isFdiToothNumber(toothNumber)).toBe(false);
  });
});
