import { phoneLastDigits, toE164Bolivia } from './phone.util';

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
});
