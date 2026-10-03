import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateMyDoctorProfileDto } from './update-my-doctor-profile.dto';

async function check(payload: Record<string, unknown>) {
  const dto = plainToInstance(UpdateMyDoctorProfileDto, payload);
  return {
    dto,
    errors: await validate(dto, {
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  };
}

// CLI-191: lo que un doctor puede editar de lo suyo.
describe('UpdateMyDoctorProfileDto', () => {
  it('acepta un cuerpo vacío (todo es opcional)', async () => {
    expect((await check({})).errors).toEqual([]);
  });

  it('normaliza nombre público, nombres y especialidad con mayúscula inicial y un solo espacio', async () => {
    const { dto, errors } = await check({
      displayName: '  dra.   marylu  aliaga ',
      firstName: ' mARylu ',
      lastNamePaternal: 'aliaga',
      specialty: ' odontología   general ',
      bio: '  Atiendo   niños  y adultos. ',
    });

    expect(errors).toEqual([]);
    expect(dto.displayName).toBe('Dra. Marylu Aliaga');
    expect(dto.firstName).toBe('Marylu');
    expect(dto.lastNamePaternal).toBe('Aliaga');
    expect(dto.specialty).toBe('Odontología General');
    expect(dto.bio).toBe('Atiendo niños y adultos.');
  });

  it('acepta un teléfono E.164 y un color #rrggbb', async () => {
    expect(
      (await check({ phone: '+59171234567', color: '#2563eb' })).errors,
    ).toEqual([]);
  });

  it.each([
    ['phone', '71234567'],
    ['color', 'azul'],
    ['color', '#12345'],
    ['firstName', 'M4rylu'],
    ['displayName', '<b>Dra</b>'],
  ])('rechaza %s = %p', async (field, value) => {
    const { errors } = await check({ [field]: value });

    expect(errors.some((e) => e.property === field)).toBe(true);
  });

  it.each([['email'], ['isBookable'], ['displayOrder'], ['photoUrl']])(
    'no permite que el doctor edite %s (queda para el administrador)',
    async (field) => {
      const { errors } = await check({
        [field]: field === 'isBookable' ? true : 'x',
      });

      expect(errors.some((e) => e.property === field)).toBe(true);
    },
  );
});
