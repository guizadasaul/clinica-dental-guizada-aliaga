import { canonicalPlace, placeKey } from './place-names';

describe('placeKey', () => {
  it('ignora mayúsculas, tildes y espacios de más', () => {
    expect(placeKey('  Cochabámba ')).toBe('cochabamba');
    expect(placeKey('SANTA   CRUZ')).toBe('santa cruz');
  });
});

describe('canonicalPlace (CLI-178)', () => {
  const known = ['Cochabamba', 'Zona Norte', 'Santa Cruz de la Sierra'];

  it.each([
    ['cochabamba', 'Cochabamba'],
    ['COCHABAMBA ', 'Cochabamba'],
    ['Cochabámba', 'Cochabamba'],
    ['zona   norte', 'Zona Norte'],
  ])('%p reusa el valor ya guardado → %p', (input, expected) => {
    expect(canonicalPlace(input, known)).toBe(expected);
  });

  it('un lugar nuevo queda con mayúscula inicial y partículas en minúscula', () => {
    expect(canonicalPlace('  villa de la   PAZ ', known)).toBe(
      'Villa de la Paz',
    );
  });

  it('acepta números en el nombre (ej. "Zona 16 de Julio")', () => {
    expect(canonicalPlace('zona 16 de julio', known)).toBe('Zona 16 de Julio');
  });
});
