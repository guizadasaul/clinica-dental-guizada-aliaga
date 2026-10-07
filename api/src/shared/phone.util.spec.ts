import {
  phoneLastDigits,
  toE164,
  toE164Bolivia,
  toLoginE164,
} from './phone.util';

describe('phone.util', () => {
  it.each([
    ['71234567', '+59171234567'],
    ['59171234567', '+59171234567'],
    ['+591 7123-4567', '+59171234567'],
  ])('toE164Bolivia(%s) → %s', (input, expected) => {
    expect(toE164Bolivia(input)).toBe(expected);
  });

  it('phoneLastDigits devuelve los últimos 3 dígitos, ignorando símbolos', () => {
    expect(phoneLastDigits('+591 7784-2665')).toBe('665');
  });

  it('phoneLastDigits acepta otra cantidad de dígitos', () => {
    expect(phoneLastDigits('+59177842665', 4)).toBe('2665');
  });

  describe('toE164 (CLI-146)', () => {
    it.each([
      ['+59171234567', '+59171234567'],
      ['59171234567', '+59171234567'],
      ['71234567', '+59171234567'],
      [' +591 712 34567 ', '+59171234567'],
      ['+5491123456789', '+5491123456789'],
    ])('%p → %s', (raw, e164) => {
      expect(toE164(raw)).toBe(e164);
    });

    it.each(['', '12', 'abc', '+59100000000000'])('rechaza %p', (raw) => {
      expect(toE164(raw)).toBeNull();
    });
  });

  describe('toLoginE164 (CLI-241)', () => {
    it.each([
      ['71234567', '+59171234567'],
      ['+59171234567', '+59171234567'],
      ['59171234567', '+59171234567'],
      // Antes toE164Bolivia los convertía en +5915491123456789 y +5911202…
      ['+5491123456789', '+5491123456789'],
      ['+12025550123', '+12025550123'],
      ['5491123456789', '+5491123456789'],
    ])('%p → %s', (raw, e164) => {
      expect(toLoginE164(raw)).toBe(e164);
    });

    it('si libphonenumber no lo reconoce, usa el criterio boliviano de siempre', () => {
      expect(toLoginE164('123')).toBe('+591123');
    });
  });
});
