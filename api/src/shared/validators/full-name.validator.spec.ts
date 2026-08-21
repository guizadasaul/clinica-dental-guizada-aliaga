import { normalizeFullName } from './full-name.validator';

describe('normalizeFullName', () => {
  // El nombre se guarda siempre igual sin importar cómo lo tipeó el visitante.
  // Las partículas ("de", "la", "del") quedan en minúscula salvo que abran el
  // nombre, porque "Juan De La Cruz" está mal escrito en español.
  // Espejo de frontend/src/app/shared/validation/full-name.validator.spec.ts —
  // los dos archivos tienen que dar exactamente el mismo resultado.
  it.each([
    ['Adrian MeRcAdO', 'Adrian Mercado'],
    ['  adrian   mercado  ', 'Adrian Mercado'],
    ['MARÍA JOSÉ GUTIÉRREZ', 'María José Gutiérrez'],
    ['pérez-gómez ana', 'Pérez-Gómez Ana'],
    ["o'connor smith", "O'Connor Smith"],
    ['juan de la cruz', 'Juan de la Cruz'],
    ['maría DEL carmen rojas', 'María del Carmen Rojas'],
    ['de la cruz pérez', 'De la Cruz Pérez'],
    ['laura', 'Laura'],
  ])('normaliza "%s" a "%s"', (entrada, esperado) => {
    expect(normalizeFullName(entrada)).toBe(esperado);
  });

  it('devuelve string vacío si no hay nada que normalizar', () => {
    expect(normalizeFullName('   ')).toBe('');
  });
});
