import { DOCTOR_COLOR_PALETTE, nextDoctorColor } from './doctor-color-palette';

describe('nextDoctorColor', () => {
  it('devuelve el primer color de la paleta si no hay doctores', () => {
    expect(nextDoctorColor([])).toBe(DOCTOR_COLOR_PALETTE[0]);
  });

  it('salta los colores ya usados (sin importar mayúsculas)', () => {
    expect(nextDoctorColor(['#2563EB', '#16a34a'])).toBe('#db2777');
  });

  it('con toda la paleta usada, rota en vez de fallar', () => {
    const used = [...DOCTOR_COLOR_PALETTE];
    expect(DOCTOR_COLOR_PALETTE).toContain(nextDoctorColor(used));
  });
});
