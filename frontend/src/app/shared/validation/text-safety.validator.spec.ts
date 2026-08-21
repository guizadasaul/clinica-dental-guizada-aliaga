import { HTML_RE, URL_TLDS, hasCharSpam, hasHtml, hasUrls } from './text-safety.validator';

describe('hasHtml', () => {
  it('detecta un tag HTML', () => {
    expect(hasHtml('hola <script>alert(1)</script>')).toBe(true);
    expect(HTML_RE.test('<b>hola</b>')).toBe(true);
  });

  it('no detecta HTML en texto plano', () => {
    expect(hasHtml('Excelente atención, muy recomendable.')).toBe(false);
  });
});

describe('hasUrls', () => {
  it('no confunde "excelente.Muy recomendable" con una URL (el backend lo documenta explícitamente)', () => {
    expect(hasUrls('excelente.Muy recomendable de verdad')).toBe(false);
  });

  it('detecta un dominio pelado con TLD conocido', () => {
    expect(hasUrls('visitá spam.com para más info')).toBe(true);
  });

  it('detecta un link explícito http(s)', () => {
    expect(hasUrls('mirá http://x.io')).toBe(true);
  });

  it('detecta un link que empieza con www.', () => {
    expect(hasUrls('entrá a www.x')).toBe(true);
  });

  it('URL_TLDS incluye los TLDs de la whitelist', () => {
    expect(URL_TLDS).toContain('com');
    expect(URL_TLDS).toContain('io');
  });
});

describe('hasCharSpam', () => {
  it('detecta un carácter repetido más de max veces seguidas', () => {
    expect(hasCharSpam('aaaaaaaaaaaaaaa', 10)).toBe(true);
  });

  it('no detecta texto normal', () => {
    expect(hasCharSpam('Excelente atención en toda la clínica', 10)).toBe(false);
  });
});
