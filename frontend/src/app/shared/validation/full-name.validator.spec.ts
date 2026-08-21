import {
  FULL_NAME_RE,
  PERSON_NAME_RE,
  normalizeFullName,
  validateFullName,
  validatePersonName,
} from './full-name.validator';

describe('FULL_NAME_RE', () => {
  it.each([
    'María José Gutiérrez',
    'Ana Li',
    "O'Connor Smith",
    'Pérez-Gómez Ana',
  ])('acepta "%s"', (value) => {
    expect(FULL_NAME_RE.test(value)).toBe(true);
  });

  it.each([
    'juan',
    'j c',
    'Juan 123',
    'a@b.com',
    '<script>alert(1)</script>',
  ])('rechaza "%s"', (value) => {
    expect(FULL_NAME_RE.test(value)).toBe(false);
  });
});

describe('PERSON_NAME_RE', () => {
  it.each(['Laura', 'Laura Pérez', 'María José Gutiérrez'])('acepta "%s"', (value) => {
    expect(PERSON_NAME_RE.test(value)).toBe(true);
  });

  it.each(['L', '123', 'a@b.com', '<script>alert(1)</script>'])('rechaza "%s"', (value) => {
    expect(PERSON_NAME_RE.test(value)).toBe(false);
  });
});

describe('normalizeFullName', () => {
  it('colapsa espacios repetidos y recorta', () => {
    expect(normalizeFullName('  Juan   Claros  ')).toBe('Juan Claros');
  });
});

describe('validateFullName', () => {
  it('acepta "Juan  Claros" (con doble espacio) tras normalizar', () => {
    expect(validateFullName('Juan  Claros')).toBeNull();
  });

  it('devuelve "empty" para vacío o solo espacios', () => {
    expect(validateFullName('')).toBe('empty');
    expect(validateFullName('   ')).toBe('empty');
  });

  it('devuelve "single-word" cuando falta el apellido', () => {
    expect(validateFullName('Laura')).toBe('single-word');
  });

  it('devuelve "invalid-chars" para dígitos o símbolos', () => {
    expect(validateFullName('Juan 123')).toBe('invalid-chars');
    expect(validateFullName('a@b.com')).toBe('invalid-chars');
    expect(validateFullName('<script>alert(1)</script>')).toBe('invalid-chars');
  });

  it('devuelve "too-long" por encima de 200 caracteres', () => {
    const tooLong = `${'Ana '.repeat(60)}Gutiérrez`;
    expect(tooLong.length).toBeGreaterThan(200);
    expect(validateFullName(tooLong)).toBe('too-long');
  });

  it('acepta nombres válidos', () => {
    expect(validateFullName('María José Gutiérrez')).toBeNull();
    expect(validateFullName("O'Connor Smith")).toBeNull();
    expect(validateFullName('Pérez-Gómez Ana')).toBeNull();
  });
});

describe('validatePersonName', () => {
  it('acepta una sola palabra', () => {
    expect(validatePersonName('Laura')).toBeNull();
    expect(validatePersonName('Laura Pérez')).toBeNull();
  });

  it('devuelve "empty" para vacío', () => {
    expect(validatePersonName('')).toBe('empty');
  });

  it('devuelve "invalid-chars" para dígitos', () => {
    expect(validatePersonName('123')).toBe('invalid-chars');
    expect(validatePersonName('L')).toBe('invalid-chars');
  });

  it('devuelve "too-long" por encima de 100 caracteres', () => {
    const tooLong = `${'Ana '.repeat(30)}Gutiérrez`;
    expect(tooLong.length).toBeGreaterThan(100);
    expect(validatePersonName(tooLong)).toBe('too-long');
  });
});
