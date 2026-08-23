import { DNI_RE, normalizeDni, isValidDni } from './dni.validator';

describe('normalizeDni', () => {
  it.each([
    ['12.345.678', '12345678'],
    ['12345678', '12345678'],
    ['  12345678  ', '12345678'],
    ['abc-123-def', 'ABC123DEF'],
    ['a b c', 'ABC'],
  ])('normaliza "%s" a "%s"', (entrada, esperado) => {
    expect(normalizeDni(entrada)).toBe(esperado);
  });
});

describe('DNI_RE', () => {
  it.each([
    ['12345678', true],
    ['ABC123DEF', true],
    ['12345', true], // mínimo 5
    ['123456789012345', true], // máximo 15
    ['1234', false], // menos de 5
    ['1234567890123456', false], // más de 15
    ['12.345.678', false], // sin normalizar
    ['', false],
  ])('%s → %s', (value, expected) => {
    expect(DNI_RE.test(value)).toBe(expected);
  });
});

describe('isValidDni', () => {
  it.each([
    ['12.345.678', true], // se normaliza internamente antes de validar
    ['  12345678  ', true],
    ['abc-123-de', true],
    ['1234', false],
    ['1234567890123456', false],
    ['', false],
  ])('%s → %s', (value, expected) => {
    expect(isValidDni(value)).toBe(expected);
  });
});
