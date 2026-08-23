import { normalizeDni, DNI_RE, IsDni } from './dni.validator';
import { validate } from 'class-validator';

describe('normalizeDni', () => {
  // El DNI se guarda siempre igual, sin importar puntos, espacios ni
  // mayúsculas: es @unique en la base, "12.345.678" y "12345678" no pueden
  // convivir como pacientes distintos.
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

class DummyDto {
  @IsDni()
  dni!: unknown;
}

describe('IsDni', () => {
  it('acepta un DNI ya normalizado', async () => {
    const dto = new DummyDto();
    dto.dni = '12345678';
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it.each([['12.345.678'], ['1234'], [12345678], [null], [undefined]])(
    'rechaza %p',
    async (value) => {
      const dto = new DummyDto();
      dto.dni = value;
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    },
  );
});
