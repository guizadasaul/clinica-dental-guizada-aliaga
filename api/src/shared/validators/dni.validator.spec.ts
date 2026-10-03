import { validate } from 'class-validator';
import {
  normalizeDni,
  DNI_RE,
  IsDni,
  dniFormatMessage,
  documentNumberLabel,
} from './dni.validator';

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
    ['12345', true],
    ['1234567', true],
    ['1234567-LP', true],
    ['1234567-1A', true],
    ['AB123456', true],
    ['123456789012', true], // 12
    ['1234567890123', false], // 13
    ['1234', false],
    ['12.345.678', false],
    ['12 345', false],
    ['-123456', false],
    ['123456-', false],
    ['1234567-lp', false], // sin normalizar
  ])('%p → %p', (value, expected) => {
    expect(DNI_RE.test(value)).toBe(expected);
  });
});

describe('mensajes', () => {
  it('nombran el tipo de documento, nunca "DNI"', () => {
    expect(documentNumberLabel('ci')).toBe('El número de CI');
    expect(documentNumberLabel('nit')).toBe('El número de NIT');
    expect(documentNumberLabel('pasaporte')).toBe('El número de pasaporte');
    expect(documentNumberLabel(undefined)).toBe('El número de documento');
    for (const type of ['ci', 'nit', 'pasaporte', undefined]) {
      expect(dniFormatMessage(type)).not.toContain('DNI');
    }
  });

  it('para la CI explica que la extensión va con guion', () => {
    expect(dniFormatMessage('ci')).toContain('1234567-LP');
    expect(dniFormatMessage('nit')).not.toContain('extensión');
  });
});

class DummyDto {
  documentType?: string;

  @IsDni()
  dni!: unknown;
}

describe('IsDni', () => {
  it('acepta un número ya normalizado, con extensión', async () => {
    const dto = new DummyDto();
    dto.dni = '1234567-LP';
    expect(await validate(dto)).toHaveLength(0);
  });

  it.each([['12.345.678'], ['1234'], [12345678], [null], [undefined]])(
    'rechaza %p',
    async (value) => {
      const dto = new DummyDto();
      dto.dni = value;
      expect((await validate(dto)).length).toBeGreaterThan(0);
    },
  );

  it('el mensaje usa el tipo de documento del mismo objeto', async () => {
    const dto = new DummyDto();
    dto.documentType = 'ci';
    dto.dni = '12 345';
    const [error] = await validate(dto);
    expect(error.constraints?.['isDni']).toContain('El número de CI');
  });
});
