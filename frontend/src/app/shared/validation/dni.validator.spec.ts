import { normalizeDni, DNI_RE, isValidDni, dniFormatMessage, documentNumberLabel } from './dni.validator';

describe('normalizeDni (CLI-177)', () => {
  it.each([
    ['  1234567 ', '1234567'],
    ['1234567-lp', '1234567-LP'],
    // No borra nada del medio: espacios y puntos los rechaza la validación.
    ['12.345.678', '12.345.678'],
    ['12 345', '12 345'],
  ])('%p → %p', (input, expected) => {
    expect(normalizeDni(input)).toBe(expected);
  });
});

describe('DNI_RE (CLI-177)', () => {
  it.each([
    ['1234567', true],
    ['1234567-LP', true],
    ['123456789012', true],
    ['1234567890123', false],
    ['1234', false],
    ['12.345.678', false],
    ['12 345', false],
    ['-123456', false],
    ['123456-', false],
  ])('%p → %p', (value, expected) => {
    expect(DNI_RE.test(value)).toBe(expected);
  });
});

describe('isValidDni', () => {
  it('normaliza mayúsculas y bordes antes de validar, pero no quita puntos ni espacios', () => {
    expect(isValidDni(' 1234567-lp ')).toBe(true);
    expect(isValidDni('12.345.678')).toBe(false);
    expect(isValidDni('12 345 678')).toBe(false);
  });
});

describe('mensajes', () => {
  it('nombran el tipo de documento, nunca "DNI"', () => {
    expect(documentNumberLabel('ci')).toBe('El número de CI');
    expect(documentNumberLabel('pasaporte')).toBe('El número de pasaporte');
    expect(documentNumberLabel('')).toBe('El número de documento');
    for (const type of ['ci', 'nit', 'pasaporte', '']) {
      expect(dniFormatMessage(type)).not.toContain('DNI');
    }
    expect(dniFormatMessage('ci')).toContain('1234567-LP');
  });
});
