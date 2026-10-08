import { undecidedTitleError } from './public-name.validator';

describe('undecidedTitleError (CLI-254)', () => {
  it.each(['Dr./Dra. Juan Pérez', 'dr/dra Juan', 'Dr. / Dra. Juan'])('rechaza "%s"', (value) => {
    expect(undecidedTitleError(value)).toBe('Elige "Dr." o "Dra." para el nombre público.');
  });

  it.each(['Dra. María López', 'Dr. Juan Pérez', 'Lucía Mamani', ''])('acepta "%s"', (value) => {
    expect(undecidedTitleError(value)).toBeNull();
  });
});
