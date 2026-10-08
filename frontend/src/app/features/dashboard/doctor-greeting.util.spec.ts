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

  it('sin título saluda solo por el primer nombre, sin adivinar doctor o doctora', () => {
    expect(doctorGreetingName('Lucía Mamani')).toBe('Lucía');
  });

  it('"Dr./Dra." (la sugerencia del alta sin elegir) saluda solo por el nombre', () => {
    expect(doctorGreetingName('Dr./Dra. Juan Pérez')).toBe('Juan');
    expect(doctorGreetingName('Dr/Dra Juan Pérez')).toBe('Juan');
    expect(doctorGreetingName('Dr./Dra.')).toBe('Doctor');
  });

  it('un nombre que empieza con "Dra" pero no es el título no se confunde', () => {
    expect(doctorGreetingName('Draco Malfoy')).toBe('Draco');
  });

  it.each([null, undefined, '', '   ', 'Dra.'])('sin nombre (%p) saluda como "Doctor"', (name) => {
    expect(doctorGreetingName(name)).toBe('Doctor');
  });
});
