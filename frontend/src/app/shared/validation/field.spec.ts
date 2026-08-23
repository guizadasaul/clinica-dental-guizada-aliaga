import { field, allValid, touchAll } from './field';

function requiredError(v: string): string | null {
  return v.trim() ? null : 'Es obligatorio.';
}

describe('field', () => {
  it('arranca sin error visible aunque el valor inicial sea inválido (sin tocar)', () => {
    const f = field<string>('', requiredError);
    expect(f.value()).toBe('');
    expect(f.error()).toBe('Es obligatorio.');
    expect(f.showError()).toBe(false);
  });

  it('muestra el error recién después de markTouched()', () => {
    const f = field<string>('', requiredError);
    f.markTouched();
    expect(f.showError()).toBe(true);
  });

  it('set() actualiza el valor y recalcula el error, sin tocar `touched`', () => {
    const f = field<string>('', requiredError);
    f.markTouched();
    expect(f.showError()).toBe(true);

    f.set('algo');
    expect(f.value()).toBe('algo');
    expect(f.error()).toBeNull();
    expect(f.showError()).toBe(false);
  });

  it('reset() reemplaza el valor y borra `touched`', () => {
    const f = field<string>('', requiredError);
    f.markTouched();
    f.reset('precargado');
    expect(f.value()).toBe('precargado');
    expect(f.showError()).toBe(false);

    // Volver a tocarlo sí debe mostrar error si el nuevo valor es inválido.
    f.reset('');
    f.markTouched();
    expect(f.showError()).toBe(true);
  });

  it('la validación puede leer otro field (dependencia cruzada reactiva)', () => {
    const birthDate = field<string>('2000-01-01', () => null);
    const lastVisit = field<string>('1999-01-01', (v: string) =>
      v < birthDate.value() ? 'No puede ser anterior al nacimiento.' : null,
    );

    expect(lastVisit.error()).not.toBeNull();

    birthDate.set('1990-01-01');
    expect(lastVisit.error()).toBeNull();
  });
});

describe('allValid', () => {
  it('true solo si todos los fields son válidos', () => {
    const a = field<string>('ok', requiredError);
    const b = field<string>('', requiredError);
    expect(allValid(a)).toBe(true);
    expect(allValid(a, b)).toBe(false);
  });

  it('sin fields, true (vacuously)', () => {
    expect(allValid()).toBe(true);
  });
});

describe('touchAll', () => {
  it('marca todos los fields pasados como tocados', () => {
    const a = field<string>('', requiredError);
    const b = field<string>('', requiredError);
    expect(a.showError()).toBe(false);
    expect(b.showError()).toBe(false);

    touchAll(a, b);

    expect(a.showError()).toBe(true);
    expect(b.showError()).toBe(true);
  });
});
