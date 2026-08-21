import { EMAIL_RE, normalizeEmail, isValidEmail } from './email.validator';

describe('EMAIL_RE / isValidEmail', () => {
  it('rechaza un TLD de una sola letra', () => {
    expect(EMAIL_RE.test('maria@correo.c')).toBe(false);
    expect(isValidEmail('maria@correo.c')).toBe(false);
  });

  it('acepta un correo bien formado', () => {
    expect(EMAIL_RE.test('maria@correo.com')).toBe(true);
    expect(isValidEmail('maria@correo.com')).toBe(true);
  });

  it('rechaza vacío', () => {
    expect(isValidEmail('')).toBe(false);
  });

  it('rechaza más de 255 caracteres', () => {
    const local = 'a'.repeat(250);
    const tooLong = `${local}@correo.com`;
    expect(tooLong.length).toBeGreaterThan(255);
    expect(isValidEmail(tooLong)).toBe(false);
  });

  it('rechaza inyección típica', () => {
    expect(isValidEmail("' OR '1'='1")).toBe(false);
    expect(isValidEmail('admin\'--')).toBe(false);
  });
});

describe('normalizeEmail', () => {
  it('recorta y pasa a minúsculas', () => {
    expect(normalizeEmail('  Maria@Correo.COM  ')).toBe('maria@correo.com');
  });
});
