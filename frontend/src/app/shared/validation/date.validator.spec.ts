import { isNotFutureDate, isAgeWithin, isNotBefore } from './date.validator';

function isoDaysFromNow(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function isoYearsAgo(years: number): string {
  const date = new Date();
  date.setFullYear(date.getFullYear() - years);
  return date.toISOString().slice(0, 10);
}

describe('isNotFutureDate', () => {
  it('acepta hoy y el pasado', () => {
    expect(isNotFutureDate(isoDaysFromNow(0))).toBe(true);
    expect(isNotFutureDate(isoDaysFromNow(-1))).toBe(true);
  });

  it('rechaza una fecha futura', () => {
    expect(isNotFutureDate(isoDaysFromNow(1))).toBe(false);
  });

  it('rechaza un valor que no es fecha', () => {
    expect(isNotFutureDate('no-es-una-fecha')).toBe(false);
    expect(isNotFutureDate('')).toBe(false);
  });
});

describe('isAgeWithin', () => {
  it('acepta una edad dentro del rango', () => {
    expect(isAgeWithin(isoYearsAgo(30), 0, 120)).toBe(true);
  });

  it('rechaza una edad fuera del rango (más de 120 años)', () => {
    expect(isAgeWithin(isoYearsAgo(150), 0, 120)).toBe(false);
  });

  it('rechaza un valor vacío', () => {
    expect(isAgeWithin('', 0, 120)).toBe(false);
  });
});

describe('isNotBefore', () => {
  it('acepta una fecha igual o posterior a la de referencia', () => {
    expect(isNotBefore(isoYearsAgo(1), isoYearsAgo(30))).toBe(true);
    expect(isNotBefore(isoYearsAgo(30), isoYearsAgo(30))).toBe(true);
  });

  it('rechaza una fecha anterior a la de referencia (lastDentistVisit antes de nacer)', () => {
    expect(isNotBefore(isoYearsAgo(30), isoYearsAgo(1))).toBe(false);
  });

  it('no aplica si el campo de referencia no está presente', () => {
    expect(isNotBefore(isoYearsAgo(1), '')).toBe(true);
  });
});
