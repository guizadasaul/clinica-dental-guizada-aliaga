import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  passwordsMatch,
  validatePassword,
} from './password.validator';

describe('validatePassword', () => {
  it('rechaza menos de 8 caracteres', () => {
    expect(validatePassword('1234567')).toContain('al menos 8');
  });

  it('acepta exactamente el mínimo', () => {
    expect(validatePassword('a'.repeat(PASSWORD_MIN_LENGTH))).toBeNull();
  });

  it('acepta exactamente el máximo', () => {
    expect(validatePassword('a'.repeat(PASSWORD_MAX_LENGTH))).toBeNull();
  });

  it('rechaza más de 72 caracteres', () => {
    expect(validatePassword('a'.repeat(PASSWORD_MAX_LENGTH + 1))).toContain('72');
  });

  it('acepta una contraseña normal sin exigir complejidad', () => {
    expect(validatePassword('contraseñasegura')).toBeNull();
  });
});

describe('passwordsMatch', () => {
  it('rechaza contraseñas distintas', () => {
    expect(passwordsMatch('abcdefgh', 'abcdefgx')).toBe('Las contraseñas no coinciden.');
  });

  it('acepta contraseñas iguales', () => {
    expect(passwordsMatch('abcdefgh', 'abcdefgh')).toBeNull();
  });
});
