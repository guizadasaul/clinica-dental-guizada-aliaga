import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateHygieneHabitsDto } from './create-hygiene-habits.dto';
import { INJECTION_PAYLOADS } from '../../../../shared/validators/__fixtures__/injection-payloads';

const VALID_HABITS = {
  usesToothbrush: true,
  brushingFrequency: 'twice_daily',
  usesDentalFloss: true,
  usesToothpick: false,
  brushesTongue: true,
  usesMouthwash: false,
};

async function validateHabits(overrides: Record<string, unknown>) {
  const dto = plainToInstance(CreateHygieneHabitsDto, {
    ...VALID_HABITS,
    ...overrides,
  });
  return validate(dto);
}

describe('CreateHygieneHabitsDto', () => {
  it('acepta hábitos válidos completos', async () => {
    const errors = await validateHabits({});
    expect(errors).toHaveLength(0);
  });

  it('acepta usesToothbrush=false sin brushingFrequency', async () => {
    const dto = plainToInstance(CreateHygieneHabitsDto, {
      usesToothbrush: false,
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('acepta que no se envíe usesToothbrush ni brushingFrequency', async () => {
    const dto = plainToInstance(CreateHygieneHabitsDto, {});
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  // Regla cruzada nueva: hoy, si se marca el cepillo y no se elige
  // frecuencia, se manda undefined en silencio.
  it('rechaza usesToothbrush=true sin brushingFrequency', async () => {
    const dto = plainToInstance(CreateHygieneHabitsDto, {
      usesToothbrush: true,
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'brushingFrequency')).toBe(true);
  });

  it('rechaza usesToothbrush=true con brushingFrequency=""', async () => {
    const dto = plainToInstance(CreateHygieneHabitsDto, {
      usesToothbrush: true,
      brushingFrequency: '',
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'brushingFrequency')).toBe(true);
  });

  it('rechaza un código de frecuencia que no está en el enum cerrado', async () => {
    const errors = await validateHabits({ brushingFrequency: '1 vez al día' });
    expect(errors.some((e) => e.property === 'brushingFrequency')).toBe(true);
  });

  it.each([
    ['once_daily'],
    ['twice_daily'],
    ['thrice_daily'],
    ['more_than_thrice'],
    ['occasionally'],
  ])('acepta el código %s', async (code) => {
    const errors = await validateHabits({ brushingFrequency: code });
    expect(errors).toHaveLength(0);
  });

  describe.each(INJECTION_PAYLOADS)('payload de inyección: %s', (payload) => {
    it('rechaza el payload en brushingFrequency (fuera del enum cerrado)', async () => {
      const errors = await validateHabits({ brushingFrequency: payload });
      expect(errors.some((e) => e.property === 'brushingFrequency')).toBe(true);
    });

    // Regresión: un único @ValidateIf gobierna TODOS los validadores de la
    // propiedad. Con la condición original (`usesToothbrush === true`) este
    // caso salteaba también @IsIn/@MaxLength y el payload llegaba sin validar
    // a una columna VARCHAR(100).
    it('rechaza el payload aunque usesToothbrush sea false', async () => {
      const dto = plainToInstance(CreateHygieneHabitsDto, {
        usesToothbrush: false,
        brushingFrequency: payload,
      });
      const errors = await validate(dto);
      expect(errors.some((e) => e.property === 'brushingFrequency')).toBe(true);
    });
  });

  it('rechaza un valor largo en brushingFrequency con usesToothbrush=false', async () => {
    const dto = plainToInstance(CreateHygieneHabitsDto, {
      usesToothbrush: false,
      brushingFrequency: 'x'.repeat(200),
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'brushingFrequency')).toBe(true);
  });
});
