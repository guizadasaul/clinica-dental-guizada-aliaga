import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { GuestContactDto } from './guest-contact.dto';
import { INJECTION_PAYLOADS } from '../../../../shared/validators/__fixtures__/injection-payloads';

const VALID_CONTACT = {
  fullName: 'Juan Claros',
  phone: '+59171234567',
  email: 'juan@correo.com',
};

async function validateContact(overrides: Partial<typeof VALID_CONTACT>) {
  const dto = plainToInstance(GuestContactDto, {
    ...VALID_CONTACT,
    ...overrides,
  });
  return validate(dto);
}

describe('GuestContactDto', () => {
  it('acepta un contacto válido', async () => {
    const errors = await validateContact({});
    expect(errors).toHaveLength(0);
  });

  it('acepta un contacto válido sin email (es opcional)', async () => {
    const dto = plainToInstance(GuestContactDto, {
      fullName: VALID_CONTACT.fullName,
      phone: VALID_CONTACT.phone,
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  // Cada payload de inyección, en cada campo de texto, produce errores de
  // validación — nunca llega "limpio" al service ni al repositorio.
  describe.each(INJECTION_PAYLOADS)('payload de inyección: %s', (payload) => {
    it('rechaza el payload en fullName', async () => {
      const errors = await validateContact({ fullName: payload });
      expect(errors.some((e) => e.property === 'fullName')).toBe(true);
    });

    it('rechaza el payload en phone', async () => {
      const errors = await validateContact({ phone: payload });
      expect(errors.some((e) => e.property === 'phone')).toBe(true);
    });

    it('rechaza el payload en email', async () => {
      const errors = await validateContact({ email: payload });
      expect(errors.some((e) => e.property === 'email')).toBe(true);
    });
  });
});
