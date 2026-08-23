import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateToothProcedureDto } from './create-tooth-procedure.dto';
import { INJECTION_PAYLOADS } from '../../../../shared/validators/__fixtures__/injection-payloads';

const VALID_PROCEDURE = {
  toothNumbers: [16],
  treatmentId: 'd290f1ee-6c54-4b01-90e6-d701748f0851',
  priceCharged: 150,
  notes: 'Sin complicaciones',
};

async function validateProcedure(overrides: Record<string, unknown>) {
  const dto = plainToInstance(CreateToothProcedureDto, {
    ...VALID_PROCEDURE,
    ...overrides,
  });
  return validate(dto);
}

describe('CreateToothProcedureDto', () => {
  it('acepta un procedimiento válido', async () => {
    const errors = await validateProcedure({});
    expect(errors).toHaveLength(0);
  });

  it('acepta toothNumbers vacío (tratamientos de arcada/boca completa)', async () => {
    const errors = await validateProcedure({ toothNumbers: [] });
    expect(errors).toHaveLength(0);
  });

  it('rechaza un treatmentId que no es UUID', async () => {
    const errors = await validateProcedure({ treatmentId: 'no-es-un-uuid' });
    expect(errors.some((e) => e.property === 'treatmentId')).toBe(true);
  });

  it('rechaza priceCharged negativo', async () => {
    const errors = await validateProcedure({ priceCharged: -10 });
    expect(errors.some((e) => e.property === 'priceCharged')).toBe(true);
  });

  it('rechaza priceCharged con más de 2 decimales', async () => {
    const errors = await validateProcedure({ priceCharged: 10.123 });
    expect(errors.some((e) => e.property === 'priceCharged')).toBe(true);
  });

  // A diferencia de create-odontogram-entries.dto.ts, toothNumbers acá NO
  // lleva IsFdiToothNumber() (fuera de alcance de CLI-39 para este DTO) —
  // sigue validando solo con @Min(11) @Max(85), así que 19 (inexistente en
  // FDI) todavía pasa.
  it('un diente FDI inexistente (19) todavía pasa Min/Max en toothNumbers', async () => {
    const errors = await validateProcedure({ toothNumbers: [19] });
    expect(errors).toHaveLength(0);
  });

  it('"" en notes se trata como no enviado (EmptyToUndefined)', async () => {
    const dto = plainToInstance(CreateToothProcedureDto, {
      ...VALID_PROCEDURE,
      notes: '',
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
    expect(dto.notes).toBeUndefined();
  });

  it('rechaza notes más largo que 500 caracteres', async () => {
    const errors = await validateProcedure({ notes: 'a'.repeat(501) });
    expect(errors.some((e) => e.property === 'notes')).toBe(true);
  });

  it('rechaza HTML en notes', async () => {
    const errors = await validateProcedure({
      notes: '<script>alert(1)</script>',
    });
    expect(errors.some((e) => e.property === 'notes')).toBe(true);
  });

  // treatmentId es UUID estricto — ningún payload de inyección clásico es
  // un UUID válido.
  describe.each(INJECTION_PAYLOADS)('payload de inyección: %s', (payload) => {
    it('rechaza el payload en treatmentId', async () => {
      const errors = await validateProcedure({ treatmentId: payload });
      expect(errors.some((e) => e.property === 'treatmentId')).toBe(true);
    });
  });
});
