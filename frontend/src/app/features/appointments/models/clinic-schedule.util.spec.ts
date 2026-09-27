import {
  clinicSlotIso,
  isWithinSchedule,
  minutesToHhmm,
  toMinutes,
  weekdayOf,
} from './clinic-schedule.util';

const BLOCKS = [
  { weekday: 1, start: '09:00', end: '12:00' },
  { weekday: 1, start: '15:00', end: '19:00' },
];
const MONDAY = '2026-09-28';

describe('clinic-schedule.util (CLI-150)', () => {
  it('convierte entre "HH:MM" y minutos', () => {
    expect(toMinutes('09:30')).toBe(570);
    expect(minutesToHhmm(570)).toBe('09:30');
    expect(minutesToHhmm(23 * 60 + 30)).toBe('23:30');
  });

  it('arma el ISO con el offset de Bolivia', () => {
    expect(clinicSlotIso(MONDAY, 21 * 60)).toBe('2026-09-28T21:00:00-04:00');
  });

  it('calcula el día de la semana del día calendario', () => {
    expect(weekdayOf(MONDAY)).toBe(1);
    expect(weekdayOf('2026-10-04')).toBe(0);
  });

  it('dentro de horario solo si el turno entero cae en un bloque', () => {
    expect(isWithinSchedule(BLOCKS, MONDAY, toMinutes('09:00'), 30)).toBe(true);
    expect(isWithinSchedule(BLOCKS, MONDAY, toMinutes('11:30'), 30)).toBe(true);
    expect(isWithinSchedule(BLOCKS, MONDAY, toMinutes('11:30'), 60)).toBe(false);
    expect(isWithinSchedule(BLOCKS, MONDAY, toMinutes('13:00'), 30)).toBe(false);
    expect(isWithinSchedule(BLOCKS, '2026-09-29', toMinutes('09:00'), 30)).toBe(false);
  });
});
