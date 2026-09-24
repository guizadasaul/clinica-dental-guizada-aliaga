import { validateSync } from 'class-validator';
import { NoCharSpam, NoHtml, NoUrls } from './text-safety.validator';

class CommentDto {
  @NoHtml()
  @NoUrls()
  @NoCharSpam(4)
  text!: unknown;
}

function errorsFor(text: unknown): string[] {
  const dto = new CommentDto();
  dto.text = text;
  return validateSync(dto).flatMap((e) => Object.keys(e.constraints ?? {}));
}

describe('NoHtml', () => {
  it('rechaza cualquier tag HTML', () => {
    expect(errorsFor('hola <b>mundo</b>')).toContain('noHtml');
    expect(errorsFor('<script>alert(1)</script>')).toContain('noHtml');
  });

  it('rechaza un tag aunque venga precedido de "<" sueltos', () => {
    expect(errorsFor('<<<a>')).toContain('noHtml');
  });

  it('acepta un "<" o ">" suelto sin formar un tag', () => {
    expect(errorsFor('50 > 10 y 3 < 4')).toEqual([]);
  });

  it('no marca como HTML una cadena larga de "<" sin cerrar', () => {
    expect(errorsFor('<'.repeat(50_000))).not.toContain('noHtml');
  });
});

describe('NoUrls', () => {
  it('rechaza links y dominios con TLD conocido', () => {
    expect(errorsFor('mirá https://spam.example')).toContain('noUrls');
    expect(errorsFor('entrá a www.algo')).toContain('noUrls');
    expect(errorsFor('comprá en spam.com')).toContain('noUrls');
  });

  it('acepta un punto pegado a la palabra siguiente', () => {
    expect(errorsFor('excelente.Muy recomendable')).toEqual([]);
  });
});

describe('NoCharSpam', () => {
  it('rechaza más caracteres repetidos seguidos que el máximo', () => {
    expect(errorsFor('holaaaaa')).toContain('noCharSpam');
  });

  it('acepta hasta el máximo', () => {
    expect(errorsFor('holaaaa')).toEqual([]);
  });
});

it('deja pasar lo que no es string (lo rechaza @IsString)', () => {
  expect(errorsFor(42)).toEqual([]);
});
