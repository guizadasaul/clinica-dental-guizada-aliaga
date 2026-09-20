import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateDoctorDto } from './create-doctor.dto';
import { UpdateDoctorDto } from './update-doctor.dto';

const VALID_PAYLOAD = {
  displayName: 'Dra. Marylu Aliaga',
  firstName: 'Marylu',
  lastNamePaternal: 'Aliaga',
  email: 'marylu@example.com',
  scheduleBlocks: [],
};

async function validateCreate(overrides: Record<string, unknown> = {}) {
  const dto = plainToInstance(CreateDoctorDto, {
    ...VALID_PAYLOAD,
    ...overrides,
  });
  return { dto, errors: await validate(dto, { whitelist: true }) };
}

describe('CreateDoctorDto (CLI-76: nombre y apellidos separados)', () => {
  it('accepts a payload with first name and paternal last name', async () => {
    const { errors } = await validateCreate();
    expect(errors).toEqual([]);
  });

  it('accepts an optional maternal last name and normalizes all name parts', async () => {
    const { dto, errors } = await validateCreate({
      firstName: '  mARylu ',
      lastNamePaternal: 'aliaga',
      lastNameMaternal: 'CALLE',
    });
    expect(errors).toEqual([]);
    expect(dto.firstName).toBe('Marylu');
    expect(dto.lastNamePaternal).toBe('Aliaga');
    expect(dto.lastNameMaternal).toBe('Calle');
  });

  it('rejects a payload without firstName', async () => {
    const { errors } = await validateCreate({ firstName: undefined });
    expect(errors.some((e) => e.property === 'firstName')).toBe(true);
  });

  it('rejects a payload without lastNamePaternal', async () => {
    const { errors } = await validateCreate({ lastNamePaternal: undefined });
    expect(errors.some((e) => e.property === 'lastNamePaternal')).toBe(true);
  });

  it('treats an empty lastNameMaternal as not provided', async () => {
    const { dto, errors } = await validateCreate({ lastNameMaternal: '' });
    expect(errors).toEqual([]);
    expect(dto.lastNameMaternal).toBeUndefined();
  });

  it('rejects HTML in the name parts', async () => {
    const { errors } = await validateCreate({
      firstName: '<script>alert(1)</script>',
    });
    expect(errors.some((e) => e.property === 'firstName')).toBe(true);
  });
});

describe('CreateDoctorDto — al menos un contacto (CLI-77)', () => {
  it('accepts a doctor with only a phone (email is not required then)', async () => {
    const { errors } = await validateCreate({
      email: undefined,
      phone: '+59170011122',
    });
    expect(errors).toEqual([]);
  });

  it('accepts a doctor with only an email', async () => {
    const { errors } = await validateCreate({ phone: undefined });
    expect(errors).toEqual([]);
  });

  it('treats an empty-string email as not provided when a phone is present', async () => {
    const { dto, errors } = await validateCreate({
      email: '',
      phone: '+59170011122',
    });
    expect(errors).toEqual([]);
    expect(dto.email).toBeUndefined();
  });

  it('rejects a doctor with neither email nor phone, with a message that names both', async () => {
    const { errors } = await validateCreate({
      email: undefined,
      phone: undefined,
    });
    const emailError = errors.find((e) => e.property === 'email');
    expect(emailError).toBeDefined();
    expect(Object.values(emailError?.constraints ?? {}).join(' ')).toContain(
      'al menos un contacto',
    );
  });

  it('still validates the email when it is provided next to a phone', async () => {
    const { errors } = await validateCreate({
      email: 'no-es-un-email',
      phone: '+59170011122',
    });
    expect(errors.some((e) => e.property === 'email')).toBe(true);
  });
});

describe('UpdateDoctorDto (CLI-76)', () => {
  it('does not require the name parts, so legacy doctors can still be edited', async () => {
    const dto = plainToInstance(UpdateDoctorDto, { specialty: 'Ortodoncia' });
    expect(await validate(dto, { whitelist: true })).toEqual([]);
  });

  it('validates the name parts when they are present', async () => {
    const dto = plainToInstance(UpdateDoctorDto, { firstName: '<b>x</b>' });
    const errors = await validate(dto, { whitelist: true });
    expect(errors.some((e) => e.property === 'firstName')).toBe(true);
  });
});
