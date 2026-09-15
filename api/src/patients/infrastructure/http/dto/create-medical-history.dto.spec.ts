// @Type() (class-transformer, usado por CreateMedicalHistoryDto.conditions/
// medications para el ValidateNested anidado, CLI-50) necesita el polyfill
// de Reflect.metadata ya cargado al momento de decorar la clase. La app real
// lo carga vía @nestjs/core al bootstrapear (main.ts); este spec no pasa por
// ahí, así que hay que importarlo a mano antes del resto (mismo fix que
// create-tooth-procedure.dto.spec.ts, CLI-49).
import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateMedicalHistoryDto } from './create-medical-history.dto';
import { INJECTION_PAYLOADS } from '../../../../shared/validators/__fixtures__/injection-payloads';

const VALID_HISTORY = {
  conditions: [
    { code: 'diabetes', diagnosedAt: '2020-01-15', notes: 'Tipo 2' },
    { code: 'asma' },
  ],
  otherDiseases: 'Migraña ocasional',
  gestationLmpDate: '2026-06-01',
  anesthesiaReactions: null,
  medications: [
    { drugName: 'Metformina', dose: '850mg', frequency: '1x día' },
  ],
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

  it('acepta conditions vacío (el paciente no tiene ninguna condición registrada)', async () => {
    const errors = await validateHistory({ conditions: [] });
    expect(errors).toHaveLength(0);
  });

  it('rechaza un código de condición repetido', async () => {
    const errors = await validateHistory({
      conditions: [{ code: 'diabetes' }, { code: 'diabetes' }],
    });
    expect(errors.some((e) => e.property === 'conditions')).toBe(true);
  });

  it('rechaza diagnosedAt futura', async () => {
    const errors = await validateHistory({
      conditions: [{ code: 'diabetes', diagnosedAt: '2099-01-01' }],
    });
    expect(errors.some((e) => e.property === 'conditions')).toBe(true);
  });

  it('rechaza HTML en las notas de una condición', async () => {
    const errors = await validateHistory({
      conditions: [
        { code: 'diabetes', notes: '<script>alert(1)</script>' },
      ],
    });
    expect(errors.some((e) => e.property === 'conditions')).toBe(true);
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

  it('"" en otherDiseases se trata como no enviado (EmptyToUndefined)', async () => {
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

  it('rechaza HTML en otherDiseases', async () => {
    const errors = await validateHistory({
      otherDiseases: '<script>alert(1)</script>',
    });
    expect(errors.some((e) => e.property === 'otherDiseases')).toBe(true);
  });

  it('rechaza gestationLmpDate futura', async () => {
    const errors = await validateHistory({ gestationLmpDate: '2099-01-01' });
    expect(errors.some((e) => e.property === 'gestationLmpDate')).toBe(true);
  });

  it('rechaza gestationLmpDate con un formato que no es fecha', async () => {
    const errors = await validateHistory({ gestationLmpDate: 'no-es-fecha' });
    expect(errors.some((e) => e.property === 'gestationLmpDate')).toBe(true);
  });

  it('acepta medications vacío', async () => {
    const errors = await validateHistory({ medications: [] });
    expect(errors).toHaveLength(0);
  });

  it('rechaza un medicamento sin drugName', async () => {
    const errors = await validateHistory({
      medications: [{ dose: '850mg' }],
    });
    expect(errors.some((e) => e.property === 'medications')).toBe(true);
  });

  it('rechaza startedAt futura en un medicamento', async () => {
    const errors = await validateHistory({
      medications: [{ drugName: 'Metformina', startedAt: '2099-01-01' }],
    });
    expect(errors.some((e) => e.property === 'medications')).toBe(true);
  });

  it('rechaza HTML en drugName', async () => {
    const errors = await validateHistory({
      medications: [{ drugName: '<img src=x onerror=alert(1)>' }],
    });
    expect(errors.some((e) => e.property === 'medications')).toBe(true);
  });

  // Los payloads de inyección clásicos llegan como strings — anesthesiaReactions
  // solo admite boolean/null, así que los rechaza a todos.
  describe.each(INJECTION_PAYLOADS)('payload de inyección: %s', (payload) => {
    it('rechaza el payload en anesthesiaReactions (no es booleano ni null)', async () => {
      const errors = await validateHistory({ anesthesiaReactions: payload });
      expect(errors.some((e) => e.property === 'anesthesiaReactions')).toBe(
        true,
      );
    });
  });
});
