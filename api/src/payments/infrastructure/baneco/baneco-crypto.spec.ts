import { decryptAes, encryptAes } from './baneco-crypto';

// Ejemplo público de la doc de BANECO (API Market v1.3.0, §5.1 "Encriptar datos").
const DOC_KEY = '40A318B299F245C2B697176723088629';
const DOC_PLAINTEXT = '1234';
const DOC_CIPHERTEXT_B64 = 'KJAzqjmwjxIOqVo5J3IH0/7fGmNdzuyszrlqexVSeos=';

describe('baneco-crypto', () => {
  it('decrypts the exact example vector published in the BANECO docs', () => {
    expect(decryptAes(DOC_CIPHERTEXT_B64, DOC_KEY)).toBe(DOC_PLAINTEXT);
  });

  it('round-trips arbitrary text through encrypt/decrypt', () => {
    const plain = 'cuenta-corriente-1234567';
    const encrypted = encryptAes(plain, DOC_KEY);
    expect(decryptAes(encrypted, DOC_KEY)).toBe(plain);
  });

  it('produces a different ciphertext each time (random IV)', () => {
    const a = encryptAes('same text', DOC_KEY);
    const b = encryptAes('same text', DOC_KEY);
    expect(a).not.toBe(b);
  });
});
