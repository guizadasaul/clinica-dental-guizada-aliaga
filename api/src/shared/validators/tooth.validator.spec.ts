import { toothTypeFor, IsFdiToothNumber } from './tooth.validator';
import { validate } from 'class-validator';

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

  // Códigos que un @Min(11) @Max(85) desnudo dejaba pasar sin existir en
  // ningún cuadrante real.
  it.each([[19], [20], [39], [56], [79], [10], [86], [0], [1.5]])(
    'diente inexistente %p → null',
    (toothNumber) => {
      expect(toothTypeFor(toothNumber)).toBeNull();
    },
  );
});

class DummyDto {
  @IsFdiToothNumber()
  toothNumber!: unknown;
}

describe('IsFdiToothNumber', () => {
  it.each([[11], [18], [48], [51], [85]])(
    'acepta el diente %i',
    async (toothNumber) => {
      const dto = new DummyDto();
      dto.toothNumber = toothNumber;
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    },
  );

  it.each([[19], [20], [39], [56], [79], ['11'], [null]])(
    'rechaza %p',
    async (toothNumber) => {
      const dto = new DummyDto();
      dto.toothNumber = toothNumber;
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    },
  );
});
