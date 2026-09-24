import { validateSync } from 'class-validator';
import {
  IsFullName,
  IsPersonName,
  normalizeFullName,
} from './full-name.validator';

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

// Los mensajes son lo que ve el visitante: tienen que decir qué corregir.
describe('IsFullName / IsPersonName', () => {
  class BookingDto {
    @IsFullName()
    fullName!: unknown;
  }

  class CommentDto {
    @IsPersonName()
    name!: unknown;
  }

  function messagesFor<T extends object>(
    cls: new () => T,
    field: keyof T,
    value: unknown,
  ): string[] {
    const dto = new cls();
    (dto as Record<keyof T, unknown>)[field] = value;
    return validateSync(dto).flatMap((e) => Object.values(e.constraints ?? {}));
  }

  describe('nombre completo (reserva)', () => {
    it('acepta nombre y apellido, aunque vengan desprolijos', () => {
      expect(messagesFor(BookingDto, 'fullName', '  juan   CLAROS ')).toEqual(
        [],
      );
    });

    it('una sola palabra: pide nombre y apellido', () => {
      expect(messagesFor(BookingDto, 'fullName', 'Juan')).toEqual([
        'Necesitamos nombre y apellido (ej: Juan Claros).',
      ]);
    });

    it.each([
      ['vacío', '   '],
      ['que no es texto', 42],
    ])('%s: pide el nombre completo', (_, value) => {
      expect(messagesFor(BookingDto, 'fullName', value)).toEqual([
        'Ingresá tu nombre completo.',
      ]);
    });

    it.each(['Juan 123', 'J'])(
      'con caracteres que no son letras (%p): solo letras',
      (value) => {
        expect(messagesFor(BookingDto, 'fullName', value)).toEqual([
          'El nombre solo puede tener letras.',
        ]);
      },
    );
  });

  describe('nombre de persona (comentarios)', () => {
    it('una palabra alcanza', () => {
      expect(messagesFor(CommentDto, 'name', 'Laura')).toEqual([]);
    });

    it('con números: solo letras (no pide apellido)', () => {
      expect(messagesFor(CommentDto, 'name', 'Laura2')).toEqual([
        'El nombre solo puede tener letras.',
      ]);
    });

    it('que no es texto: pide el nombre', () => {
      expect(messagesFor(CommentDto, 'name', null)).toEqual([
        'Ingresá tu nombre completo.',
      ]);
    });
  });
});
