import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { GuestContactDto } from './guest-contact.dto';
import { INJECTION_PAYLOADS } from '../../../../shared/validators/__fixtures__/injection-payloads';

const VALID_CONTACT = {
  firstName: 'Juan',
  lastNamePaternal: 'Claros',
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
      firstName: VALID_CONTACT.firstName,
      lastNamePaternal: VALID_CONTACT.lastNamePaternal,
      phone: VALID_CONTACT.phone,
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('acepta un contacto válido sin lastNameMaternal (es opcional)', async () => {
    const errors = await validateContact({});
    expect(errors).toHaveLength(0);
  });

  it('acepta lastNameMaternal cuando se envía', async () => {
    const errors = await validateContact({
      lastNameMaternal: 'Gomez',
    } as Partial<typeof VALID_CONTACT> & { lastNameMaternal: string });
    expect(errors).toHaveLength(0);
  });

  it('rechaza firstName vacío', async () => {
    const errors = await validateContact({ firstName: '' });
    expect(errors.some((e) => e.property === 'firstName')).toBe(true);
  });

  it('rechaza lastNamePaternal vacío', async () => {
    const errors = await validateContact({ lastNamePaternal: '' });
    expect(errors.some((e) => e.property === 'lastNamePaternal')).toBe(true);
  });

  it('acepta un firstName de una sola palabra (a diferencia del viejo fullName)', async () => {
    const errors = await validateContact({ firstName: 'Juan' });
    expect(errors).toHaveLength(0);
  });

  // "admin'--" es, carácter por carácter, letras + apostrofo + guiones — la
  // misma forma que un nombre real como "O'Brien". IsPersonName() (regla de
  // firstName/lastNamePaternal, una palabra alcanza) lo acepta por diseño —
  // ver el comentario equivalente en create-patient.dto.spec.ts. No es un
  // bug: Prisma parametriza, así que igual no hay inyección posible.
  const NAME_PAYLOADS = INJECTION_PAYLOADS.filter(
    (payload) => payload !== "admin'--",
  );

  // Cada payload de inyección, en cada campo de texto, produce errores de
  // validación — nunca llega "limpio" al service ni al repositorio.
  describe.each(INJECTION_PAYLOADS)('payload de inyección: %s', (payload) => {
    it('rechaza el payload en phone', async () => {
      const errors = await validateContact({ phone: payload });
      expect(errors.some((e) => e.property === 'phone')).toBe(true);
    });

    it('rechaza el payload en email', async () => {
      const errors = await validateContact({ email: payload });
      expect(errors.some((e) => e.property === 'email')).toBe(true);
    });
  });

  describe.each(NAME_PAYLOADS)('payload de inyección en nombre: %s', (payload) => {
    it('rechaza el payload en firstName', async () => {
      const errors = await validateContact({ firstName: payload });
      expect(errors.some((e) => e.property === 'firstName')).toBe(true);
    });

    it('rechaza el payload en lastNamePaternal', async () => {
      const errors = await validateContact({ lastNamePaternal: payload });
      expect(errors.some((e) => e.property === 'lastNamePaternal')).toBe(true);
    });
  });
});
