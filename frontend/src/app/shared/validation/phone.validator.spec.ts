import {
  E164_RE,
  PRIORITY_COUNTRIES,
  DEFAULT_COUNTRY,
  toE164,
  validateNationalPhone,
  callingCodeFor,
} from './phone.validator';

describe('E164_RE', () => {
  it('acepta un número boliviano bien formado', () => {
    expect(E164_RE.test('+59171234567')).toBe(true);
  });

  it('rechaza sin "+", con letras o con separadores', () => {
    expect(E164_RE.test('59171234567')).toBe(false);
    expect(E164_RE.test('+591 71234567')).toBe(false);
    expect(E164_RE.test('+++----')).toBe(false);
  });
});

describe('DEFAULT_COUNTRY / PRIORITY_COUNTRIES', () => {
  it('Bolivia es el país por defecto y encabeza el grupo fijo', () => {
    expect(DEFAULT_COUNTRY).toBe('BO');
    expect(PRIORITY_COUNTRIES[0]).toBe('BO');
  });

  it('incluye el grupo fijo pedido por el plan', () => {
    expect(PRIORITY_COUNTRIES).toEqual(['BO', 'AR', 'BR', 'CL', 'PE', 'PY', 'UY', 'CO', 'EC', 'MX', 'ES', 'US']);
  });
});

describe('callingCodeFor / toE164', () => {
  it('arma el E.164 a partir del indicativo y el número nacional', () => {
    expect(callingCodeFor('BO')).toBe('591');
    expect(toE164(callingCodeFor('BO'), '77842665')).toBe('+59177842665');
  });
});

describe('validateNationalPhone', () => {
  // "77842665" es el único users.phone real cargado en la base (sin el +591) —
  // verificado contra los datos reales, ver phone.util.spec.ts para el otro lado.
  it('acepta el número boliviano real de 8 dígitos', () => {
    const result = validateNationalPhone('77842665', 'BO');
    expect(result.valid).toBe(true);
  });

  it('rechaza 7 dígitos como TOO_SHORT', () => {
    const result = validateNationalPhone('7784266', 'BO');
    expect(result.valid).toBe(false);
    expect(result.lengthIssue).toBe('TOO_SHORT');
  });

  it('rechaza 9 dígitos', () => {
    const result = validateNationalPhone('777842665', 'BO');
    expect(result.valid).toBe(false);
  });

  it('rechaza vacío sin llamar a la librería', () => {
    const result = validateNationalPhone('', 'BO');
    expect(result.valid).toBe(false);
    expect(result.lengthIssue).toBeUndefined();
  });

  it('acepta un número argentino válido de 10 dígitos', () => {
    const result = validateNationalPhone('1123456789', 'AR');
    expect(result.valid).toBe(true);
  });
});
