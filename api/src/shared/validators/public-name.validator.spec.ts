import { validate } from 'class-validator';
import { NoUndecidedTitle } from './public-name.validator';

class Dto {
  @NoUndecidedTitle()
  displayName!: unknown;
}

async function errorsFor(value: unknown): Promise<string[]> {
  const dto = new Dto();
  dto.displayName = value;
  const errors = await validate(dto);
  return errors.flatMap((e) => Object.values(e.constraints ?? {}));
}

describe('NoUndecidedTitle (CLI-254)', () => {
  it.each(['Dr./Dra. Juan Pérez', 'dr/dra Juan', 'Dr. / Dra. Juan'])(
    'rechaza "%s"',
    async (value) => {
      expect(await errorsFor(value)).toEqual([
        'Elige "Dr." o "Dra." para el nombre público.',
      ]);
    },
  );

  it.each(['Dra. María López', 'Dr. Juan Pérez', 'Lucía Mamani', 42])(
    'acepta %p',
    async (value) => {
      expect(await errorsFor(value)).toEqual([]);
    },
  );
});
