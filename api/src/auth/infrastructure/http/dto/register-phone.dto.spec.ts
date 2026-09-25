import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { RegisterPhoneDto } from './register-phone.dto';
import { INJECTION_PAYLOADS } from '../../../../shared/validators/__fixtures__/injection-payloads';

const VALID_REGISTRATION = {
  phone: '+59177842665',
  password: 'una-contraseña-segura',
  inviteToken: 'token-de-invitacion',
};

async function validateRegistration(
  overrides: Partial<typeof VALID_REGISTRATION>,
) {
  const dto = plainToInstance(RegisterPhoneDto, {
    ...VALID_REGISTRATION,
    ...overrides,
  });
  return validate(dto);
}

describe('RegisterPhoneDto', () => {
  it('acepta un registro válido', async () => {
    const errors = await validateRegistration({});
    expect(errors).toHaveLength(0);
  });

  it('rechaza una contraseña de menos de 8 caracteres', async () => {
    const errors = await validateRegistration({ password: '1234567' });
    expect(errors.some((e) => e.property === 'password')).toBe(true);
  });

  it('rechaza un registro sin token de invitación', async () => {
    const dto = plainToInstance(RegisterPhoneDto, {
      phone: VALID_REGISTRATION.phone,
      password: VALID_REGISTRATION.password,
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'inviteToken')).toBe(true);
  });

  it('rechaza un token de invitación de más de 400 caracteres', async () => {
    const errors = await validateRegistration({ inviteToken: 'a'.repeat(401) });
    expect(errors.some((e) => e.property === 'inviteToken')).toBe(true);
  });

  it('acepta una contraseña de exactamente 8 caracteres', async () => {
    const errors = await validateRegistration({ password: '12345678' });
    expect(errors.some((e) => e.property === 'password')).toBe(false);
  });

  // `phone` sí es texto restringido a E.164 — cualquier payload de inyección
  // lo rechaza. `password` a propósito NO restringe qué caracteres puede
  // tener (solo el largo, 8-72): limitar el charset de una contraseña es un
  // antipatrón de seguridad, no una mejora, y nunca se concatena en SQL
  // (Prisma/Supabase Auth la hashean). Por eso este spec no repite el
  // barrido de payloads contra `password`.
  describe.each(INJECTION_PAYLOADS)('payload de inyección: %s', (payload) => {
    it('rechaza el payload en phone', async () => {
      const errors = await validateRegistration({ phone: payload });
      expect(errors.some((e) => e.property === 'phone')).toBe(true);
    });
  });
});
