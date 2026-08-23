import { normalizeText, optionalTextError, requiredTextError } from './text.validator';

describe('normalizeText', () => {
  it.each([
    ['  hola   mundo ', 'hola mundo'],
    ['sin espacios de más', 'sin espacios de más'],
    ['   ', ''],
    ['', ''],
  ])('normaliza "%s" a "%s"', (entrada, esperado) => {
    expect(normalizeText(entrada)).toBe(esperado);
  });
});

describe('optionalTextError', () => {
  it('acepta vacío (campo opcional)', () => {
    expect(optionalTextError('', 10)).toBeNull();
    expect(optionalTextError('   ', 10)).toBeNull();
  });

  it('acepta texto dentro del largo máximo', () => {
    expect(optionalTextError('hola mundo', 20)).toBeNull();
  });

  it('rechaza texto más largo que el máximo', () => {
    expect(optionalTextError('a'.repeat(21), 20)).not.toBeNull();
  });

  it('rechaza HTML', () => {
    expect(optionalTextError('<script>alert(1)</script>', 100)).not.toBeNull();
  });

  it('con contenido, rechaza texto más corto que el mínimo', () => {
    expect(optionalTextError('ok', 500, 3)).not.toBeNull();
  });

  it('con contenido, acepta texto que cumple el mínimo', () => {
    expect(optionalTextError('Ok!', 500, 3)).toBeNull();
  });

  it('sigue aceptando vacío aunque haya mínimo (campo opcional)', () => {
    expect(optionalTextError('', 500, 3)).toBeNull();
    expect(optionalTextError('   ', 500, 3)).toBeNull();
  });
});

describe('requiredTextError', () => {
  it('rechaza vacío', () => {
    expect(requiredTextError('', 500)).not.toBeNull();
    expect(requiredTextError('   ', 500)).not.toBeNull();
  });

  it('acepta texto válido dentro de los límites', () => {
    expect(requiredTextError('Diente sano', 500, { minLength: 3 })).toBeNull();
  });

  it('rechaza texto más corto que el mínimo', () => {
    expect(requiredTextError('ok', 500, { minLength: 3 })).not.toBeNull();
  });

  it('rechaza texto más largo que el máximo', () => {
    expect(requiredTextError('a'.repeat(501), 500)).not.toBeNull();
  });

  it('rechaza HTML', () => {
    expect(requiredTextError('<b>caries</b>', 500)).not.toBeNull();
  });
});
