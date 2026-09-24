import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdatePatientDto } from './update-patient.dto';

async function errorsFor(body: Record<string, unknown>) {
  const errors = await validate(plainToInstance(UpdatePatientDto, body));
  return errors.map((e) => e.property);
}

// PATCH parcial: ningún campo es obligatorio, pero lo que viene se valida
// con las mismas reglas que al crear.
describe('UpdatePatientDto', () => {
  it('acepta un cuerpo vacío', async () => {
    await expect(errorsFor({})).resolves.toEqual([]);
  });

  it('acepta un solo campo válido', async () => {
    await expect(errorsFor({ occupation: 'Docente' })).resolves.toEqual([]);
  });

  it('sigue validando los campos heredados de CreatePatientDto', async () => {
    await expect(errorsFor({ firstName: '<b>Ana</b>' })).resolves.toContain(
      'firstName',
    );
  });

  it('acepta un email válido y rechaza uno inválido o demasiado largo', async () => {
    await expect(errorsFor({ email: 'ana@example.com' })).resolves.toEqual([]);
    await expect(errorsFor({ email: 'no-es-email' })).resolves.toEqual([
      'email',
    ]);
    await expect(
      errorsFor({ email: `${'a'.repeat(250)}@example.com` }),
    ).resolves.toEqual(['email']);
  });

  it('no deja cambiar el usuario dueño de la ficha', async () => {
    const errors = await validate(
      plainToInstance(UpdatePatientDto, { userId: 'otro-user' }),
      { whitelist: true, forbidNonWhitelisted: true },
    );

    expect(errors.map((e) => e.property)).toEqual(['userId']);
  });
});
