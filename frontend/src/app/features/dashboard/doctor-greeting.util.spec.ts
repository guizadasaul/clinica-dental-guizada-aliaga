import { doctorGreetingName } from './doctor-greeting.util';

describe('doctorGreetingName (CLI-254)', () => {
  it.each([
    ['Dra. María López', 'Dra. María'],
    ['Dr. Ariel Guizada', 'Dr. Ariel'],
    ['dra maría lópez', 'Dra. maría'],
    ['Doctora Ana Pérez', 'Dra. Ana'],
    ['Doctor Pavel Rojas', 'Dr. Pavel'],
    ['  Dra.   María  ', 'Dra. María'],
  ])('con título: "%s" → "%s"', (name, expected) => {
    expect(doctorGreetingName(name)).toBe(expected);
  });

  it('sin título saluda con "Dr." y el primer nombre (CLI-267)', () => {
    expect(doctorGreetingName('Paul Rojas')).toBe('Dr. Paul');
  });

  it('"Dr./Dra." (la sugerencia del alta sin elegir) saluda con "Dr."', () => {
    expect(doctorGreetingName('Dr./Dra. Juan Pérez')).toBe('Dr. Juan');
    expect(doctorGreetingName('Dr/Dra Juan Pérez')).toBe('Dr. Juan');
    expect(doctorGreetingName('Dr./Dra.')).toBe('Doctor');
  });

  it('un nombre que empieza con "Dra" pero no es el título no se confunde', () => {
    expect(doctorGreetingName('Draco Malfoy')).toBe('Dr. Draco');
  });

  it.each([null, undefined, '', '   ', 'Dra.'])('sin nombre (%p) saluda como "Doctor"', (name) => {
    expect(doctorGreetingName(name)).toBe('Doctor');
  });
});
