import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateMedicalHistoryDto } from './create-medical-history.dto';
import { INJECTION_PAYLOADS } from '../../../../shared/validators/__fixtures__/injection-payloads';

const VALID_HISTORY = {
  hasAllergies: true,
  kidneyProblems: false,
  otherDiseases: 'Asma leve',
  gestationPeriod: '2do trimestre',
  anesthesiaReactions: null,
  currentMedications: 'Ibuprofeno',
};

async function validateHistory(overrides: Record<string, unknown>) {
  const dto = plainToInstance(CreateMedicalHistoryDto, {
    ...VALID_HISTORY,
    ...overrides,
  });
  return validate(dto);
}

describe('CreateMedicalHistoryDto', () => {
  it('acepta un historial completo y válido', async () => {
    const errors = await validateHistory({});
    expect(errors).toHaveLength(0);
  });

  it('acepta un historial vacío (todos los campos son opcionales)', async () => {
    const dto = plainToInstance(CreateMedicalHistoryDto, {});
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  // Tri-estado (Sí / No / No sabe): los tres valores son válidos.
  it.each([[true], [false], [null]])(
    'acepta anesthesiaReactions = %p',
    async (value) => {
      const errors = await validateHistory({ anesthesiaReactions: value });
      expect(errors).toHaveLength(0);
    },
  );

  it('rechaza anesthesiaReactions con un valor que no es booleano ni null', async () => {
    const errors = await validateHistory({ anesthesiaReactions: 'si' });
    expect(errors.some((e) => e.property === 'anesthesiaReactions')).toBe(true);
  });

  it('"" en un campo de texto opcional se trata como no enviado (EmptyToUndefined)', async () => {
    const dto = plainToInstance(CreateMedicalHistoryDto, {
      ...VALID_HISTORY,
      otherDiseases: '',
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
    expect(dto.otherDiseases).toBeUndefined();
  });

  it('rechaza otherDiseases más largo que 1000 caracteres', async () => {
    const errors = await validateHistory({ otherDiseases: 'a'.repeat(1001) });
    expect(errors.some((e) => e.property === 'otherDiseases')).toBe(true);
  });

  it('rechaza gestationPeriod más largo que 100 caracteres', async () => {
    const errors = await validateHistory({
      gestationPeriod: 'a'.repeat(101),
    });
    expect(errors.some((e) => e.property === 'gestationPeriod')).toBe(true);
  });

  it('rechaza HTML en otherDiseases', async () => {
    const errors = await validateHistory({
      otherDiseases: '<script>alert(1)</script>',
    });
    expect(errors.some((e) => e.property === 'otherDiseases')).toBe(true);
  });

  it('rechaza HTML en currentMedications', async () => {
    const errors = await validateHistory({
      currentMedications: '<img src=x onerror=alert(1)>',
    });
    expect(errors.some((e) => e.property === 'currentMedications')).toBe(true);
  });

  // Los campos clínicos booleanos rechazan cualquier valor que no sea
  // booleano — incluidos los payloads de inyección clásicos, que llegan acá
  // como strings.
  describe.each(INJECTION_PAYLOADS)('payload de inyección: %s', (payload) => {
    it('rechaza el payload en hasAllergies (no es booleano)', async () => {
      const errors = await validateHistory({ hasAllergies: payload });
      expect(errors.some((e) => e.property === 'hasAllergies')).toBe(true);
    });
  });
});
