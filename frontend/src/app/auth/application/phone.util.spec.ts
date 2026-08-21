import { looksLikePhone, normalizePhone } from './phone.util';

describe('normalizePhone', () => {
  // Verificado contra los datos reales: el único users.phone cargado en la base
  // es "59177842665". Tipeando "77842665" (sin prefijo) tiene que seguir dando
  // "+59177842665" — cero regresión de login.
  it('sin prefijo, asume Bolivia', () => {
    expect(normalizePhone('77842665')).toBe('+59177842665');
  });

  it('con el prefijo 591 ya pegado (compat: cuentas ya creadas así)', () => {
    expect(normalizePhone('59177842665')).toBe('+59177842665');
  });

  it('respeta un "+" explícito de cualquier país', () => {
    expect(normalizePhone('+5491123456789')).toBe('+5491123456789');
  });

  it('recorta espacios y separadores', () => {
    expect(normalizePhone('  77842665  ')).toBe('+59177842665');
    expect(normalizePhone('+54 9 11 2345-6789')).toBe('+5491123456789');
  });
});

describe('looksLikePhone', () => {
  it('reconoce dígitos, "+", espacios y guiones como teléfono', () => {
    expect(looksLikePhone('77842665')).toBe(true);
    expect(looksLikePhone('+591 77842665')).toBe(true);
  });

  it('no reconoce un correo como teléfono', () => {
    expect(looksLikePhone('maria@correo.com')).toBe(false);
  });
});
