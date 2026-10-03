import { scheduleError } from './schedule-blocks.util';

const b = (weekday: number, start: string, end: string) => ({ weekday, start, end });

describe('scheduleError (CLI-191)', () => {
  it('un horario vacío o ordenado es válido', () => {
    expect(scheduleError([])).toBeNull();
    expect(scheduleError([b(1, '08:00', '12:00'), b(1, '14:00', '18:00'), b(2, '08:00', '12:00')])).toBeNull();
  });

  it('dos bloques que se tocan no se solapan', () => {
    expect(scheduleError([b(1, '08:00', '12:00'), b(1, '12:00', '18:00')])).toBeNull();
  });

  it('el mismo rango en días distintos está bien', () => {
    expect(scheduleError([b(1, '08:00', '12:00'), b(2, '08:00', '12:00')])).toBeNull();
  });

  it.each([
    ['inicio igual al fin', [b(1, '09:00', '09:00')]],
    ['inicio después del fin', [b(1, '18:00', '09:00')]],
  ])('rechaza %s', (_, blocks) => {
    expect(scheduleError(blocks)).toContain('inicio');
  });

  it('rechaza bloques del mismo día que se solapan', () => {
    expect(scheduleError([b(1, '08:00', '12:00'), b(1, '11:00', '15:00')])).toContain('solapan');
  });

  it('rechaza un bloque sin hora cargada', () => {
    expect(scheduleError([b(1, '', '12:00')])).toContain('Completa');
  });
});
