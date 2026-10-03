import { collapseSpaces } from './transforms';

describe('collapseSpaces (CLI-183)', () => {
  it('deja un solo espacio entre palabras y ninguno en los bordes', () => {
    expect(collapseSpaces('  dolor   fuerte  al   frío ')).toBe(
      'dolor fuerte al frío',
    );
  });

  it('no cambia las mayúsculas del texto', () => {
    expect(collapseSpaces(' Sin   alergias a la PENICILINA ')).toBe(
      'Sin alergias a la PENICILINA',
    );
  });

  it('conserva los saltos de línea, sin espacios en los bordes de cada línea', () => {
    expect(collapseSpaces('  primera   línea  \n   segunda\tlínea ')).toBe(
      'primera línea\nsegunda línea',
    );
  });

  it('deja como máximo una línea en blanco seguida', () => {
    expect(collapseSpaces('uno\n\n\n\ndos')).toBe('uno\n\ndos');
  });

  it('unifica los saltos de línea de Windows', () => {
    expect(collapseSpaces('uno\r\ndos')).toBe('uno\ndos');
  });

  it('un texto de solo espacios queda vacío', () => {
    expect(collapseSpaces('  \n \t ')).toBe('');
  });
});
