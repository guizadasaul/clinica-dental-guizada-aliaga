import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreatePatientDto } from './create-patient.dto';
import { INJECTION_PAYLOADS } from '../../../../shared/validators/__fixtures__/injection-payloads';

function isoYearsAgo(years: number): string {
  const date = new Date();
  date.setFullYear(date.getFullYear() - years);
  return date.toISOString().slice(0, 10);
}

function isoDaysFromNow(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

// Campos obligatorios: nombre, apellido paterno, fecha de nacimiento, lugar
// de nacimiento, sexo, ocupación, tipo+número de documento (CLI-54),
// dirección + zona + ciudad (CLI-54) y contacto de emergencia completo
// (nombre, teléfono, parentesco). El resto sigue opcional.
const VALID_PATIENT = {
  firstName: 'Juan',
  lastNamePaternal: 'Claros',
  birthDate: isoYearsAgo(30),
  birthPlace: 'La Paz',
  sex: 'masculino',
  occupation: 'Ingeniero',
  documentType: 'ci',
  dni: '12345678',
  address: 'Av. Siempre Viva 123',
  zona: 'Zona Norte',
  ciudad: 'Cochabamba',
  emergencyContactName: 'Maria Claros',
  emergencyContactPhone: '+59177777777',
  emergencyContactRelationship: 'Madre',
};

async function validatePatient(overrides: Record<string, unknown>) {
  const dto = plainToInstance(CreatePatientDto, {
    ...VALID_PATIENT,
    ...overrides,
  });
  return validate(dto);
}

describe('CreatePatientDto', () => {
  it('acepta un paciente válido con solo los campos requeridos', async () => {
    const errors = await validatePatient({});
    expect(errors).toHaveLength(0);
  });

  it('acepta un paciente válido con todos los campos opcionales también completos', async () => {
    const errors = await validatePatient({
      lastNameMaternal: 'Perez',
      phone: '+59171234567',
      consultationReason: 'Dolor de muela',
      lastDentistVisit: isoYearsAgo(1),
      lastVisitTreatment: 'Limpieza',
      familyHistory: 'Sin antecedentes',
    });
    expect(errors).toHaveLength(0);
  });

  // Entrada real usada en la verificación manual del plan: espacios de más +
  // mayúsculas mezcladas en el nombre, DNI con puntos.
  it('normaliza nombre con espacios de más y mayúsculas mezcladas, y DNI con puntos', async () => {
    const dto = plainToInstance(CreatePatientDto, {
      ...VALID_PATIENT,
      firstName: '  aDrIaN   ',
      lastNamePaternal: 'mercado',
      dni: '12.345.678',
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
    expect(dto.firstName).toBe('Adrian');
    expect(dto.lastNamePaternal).toBe('Mercado');
    expect(dto.dni).toBe('12345678');
  });

  it('rechaza una fecha de nacimiento futura', async () => {
    const errors = await validatePatient({ birthDate: isoDaysFromNow(1) });
    expect(errors.some((e) => e.property === 'birthDate')).toBe(true);
  });

  it('rechaza una edad fuera de 0-120 años', async () => {
    const errors = await validatePatient({ birthDate: isoYearsAgo(150) });
    expect(errors.some((e) => e.property === 'birthDate')).toBe(true);
  });

  it('rechaza lastDentistVisit anterior al nacimiento', async () => {
    const errors = await validatePatient({
      birthDate: isoYearsAgo(1),
      lastDentistVisit: isoYearsAgo(30),
    });
    expect(errors.some((e) => e.property === 'lastDentistVisit')).toBe(true);
  });

  it('rechaza lastDentistVisit futuro', async () => {
    const errors = await validatePatient({
      lastDentistVisit: isoDaysFromNow(1),
    });
    expect(errors.some((e) => e.property === 'lastDentistVisit')).toBe(true);
  });

  it('rechaza un DNI mal formado luego de normalizar (muy corto)', async () => {
    const errors = await validatePatient({ dni: '123' });
    expect(errors.some((e) => e.property === 'dni')).toBe(true);
  });

  // CLI-54: (documentType, dni) es el par único real, no dni solo.
  it.each(['ci', 'pasaporte', 'nit'])('acepta documentType %s', async (value) => {
    const errors = await validatePatient({ documentType: value });
    expect(errors).toHaveLength(0);
  });

  it('rechaza un documentType fuera del enum cerrado', async () => {
    const errors = await validatePatient({ documentType: 'licencia' });
    expect(errors.some((e) => e.property === 'documentType')).toBe(true);
  });

  it('rechaza documentType vacío', async () => {
    const errors = await validatePatient({ documentType: '' });
    expect(errors.some((e) => e.property === 'documentType')).toBe(true);
  });

  it('rechaza zona vacía', async () => {
    const errors = await validatePatient({ zona: '' });
    expect(errors.some((e) => e.property === 'zona')).toBe(true);
  });

  it('rechaza ciudad vacía', async () => {
    const errors = await validatePatient({ ciudad: '' });
    expect(errors.some((e) => e.property === 'ciudad')).toBe(true);
  });

  it('rechaza zona más larga que 100 caracteres', async () => {
    const errors = await validatePatient({ zona: 'a'.repeat(101) });
    expect(errors.some((e) => e.property === 'zona')).toBe(true);
  });

  it('rechaza un sex fuera del enum cerrado', async () => {
    const errors = await validatePatient({ sex: 'otro-valor' });
    expect(errors.some((e) => e.property === 'sex')).toBe(true);
  });

  it('rechaza un teléfono que no está en E.164', async () => {
    const errors = await validatePatient({ phone: '77842665' });
    expect(errors.some((e) => e.property === 'phone')).toBe(true);
  });

  it('"" en un campo de texto opcional se trata como no enviado (EmptyToUndefined)', async () => {
    const dto = plainToInstance(CreatePatientDto, {
      ...VALID_PATIENT,
      consultationReason: '',
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
    expect(dto.consultationReason).toBeUndefined();
  });

  it('rechaza address más largo que 300 caracteres', async () => {
    const errors = await validatePatient({ address: 'a'.repeat(301) });
    expect(errors.some((e) => e.property === 'address')).toBe(true);
  });

  it('rechaza consultationReason más largo que 1000 caracteres', async () => {
    const errors = await validatePatient({
      consultationReason: 'a'.repeat(1001),
    });
    expect(errors.some((e) => e.property === 'consultationReason')).toBe(true);
  });

  it('rechaza HTML en un campo de texto libre (occupation)', async () => {
    const errors = await validatePatient({
      occupation: '<script>alert(1)</script>',
    });
    expect(errors.some((e) => e.property === 'occupation')).toBe(true);
  });

  // Campos que pasaron de opcionales a obligatorios — la ficha no queda
  // completa sin lugar de nacimiento, sexo, ocupación, DNI, dirección ni
  // contacto de emergencia.
  describe.each([
    'birthPlace',
    'sex',
    'occupation',
    'dni',
    'address',
    'emergencyContactName',
    'emergencyContactPhone',
    'emergencyContactRelationship',
  ])('%s es obligatorio', (property) => {
    it('rechaza cuando falta', async () => {
      const errors = await validatePatient({ [property]: undefined });
      expect(errors.some((e) => e.property === property)).toBe(true);
    });

    it('rechaza cuando llega vacío', async () => {
      const errors = await validatePatient({ [property]: '' });
      expect(errors.some((e) => e.property === property)).toBe(true);
    });
  });

  // Mínimo de 3 caracteres en el texto libre — antes una sola letra o un
  // solo número pasaban sin problema.
  describe.each([
    ['birthPlace', 'La'],
    ['occupation', 'Al'],
    ['address', 'A1'],
    ['emergencyContactRelationship', 'Yo'],
    ['consultationReason', 'Ay'],
    ['lastVisitTreatment', 'X2'],
    ['familyHistory', 'Sí'],
  ])('mínimo de 3 caracteres', (property, tooShort) => {
    it(`rechaza ${property} con menos de 3 caracteres`, async () => {
      const errors = await validatePatient({ [property]: tooShort });
      expect(errors.some((e) => e.property === property)).toBe(true);
    });
  });

  it('rechaza emergencyContactName de una sola letra', async () => {
    const errors = await validatePatient({ emergencyContactName: 'A' });
    expect(errors.some((e) => e.property === 'emergencyContactName')).toBe(
      true,
    );
  });

  // "admin'--" es, carácter por carácter, letras + apostrofo + guiones — la
  // misma forma que un nombre real como "O'Brien". IsPersonName() (regla de
  // firstName/lastNamePaternal, una palabra alcanza) lo acepta por diseño —
  // ver el comentario equivalente en create-testimonial.dto.spec.ts. No es
  // un bug: Prisma parametriza, así que igual no hay inyección posible.
  const NAME_PAYLOADS = INJECTION_PAYLOADS.filter(
    (payload) => payload !== "admin'--",
  );

  describe.each(NAME_PAYLOADS)('payload de inyección: %s', (payload) => {
    it('rechaza el payload en firstName', async () => {
      const errors = await validatePatient({ firstName: payload });
      expect(errors.some((e) => e.property === 'firstName')).toBe(true);
    });

    it('rechaza el payload en lastNamePaternal', async () => {
      const errors = await validatePatient({ lastNamePaternal: payload });
      expect(errors.some((e) => e.property === 'lastNamePaternal')).toBe(true);
    });
  });

  describe.each(INJECTION_PAYLOADS)('payload de inyección: %s', (payload) => {
    it('rechaza el payload en dni', async () => {
      const errors = await validatePatient({ dni: payload });
      expect(errors.some((e) => e.property === 'dni')).toBe(true);
    });

    it('rechaza el payload en phone', async () => {
      const errors = await validatePatient({ phone: payload });
      expect(errors.some((e) => e.property === 'phone')).toBe(true);
    });
  });
});
