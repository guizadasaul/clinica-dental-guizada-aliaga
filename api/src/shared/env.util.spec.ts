import { readEnvInt } from './env.util';

describe('readEnvInt', () => {
  const NAME = 'TEST_READ_ENV_INT';

  afterEach(() => {
    delete process.env[NAME];
  });

  it('usa el fallback si la variable no está o está vacía', () => {
    expect(readEnvInt(NAME, 5)).toBe(5);
    process.env[NAME] = '';
    expect(readEnvInt(NAME, 5)).toBe(5);
  });

  it('lee un entero positivo', () => {
    process.env[NAME] = '20';
    expect(readEnvInt(NAME, 5)).toBe(20);
  });

  it.each(['abc', '2.5', '0', '-3'])(
    'ignora un valor inválido (%s) y usa el fallback',
    (raw) => {
      process.env[NAME] = raw;
      expect(readEnvInt(NAME, 5)).toBe(5);
    },
  );
});
