// @Type() (class-transformer, usado por CreateToothProcedureDto.teeth para el
// ValidateNested anidado, CLI-41) necesita el polyfill de Reflect.metadata ya
// cargado al momento de decorar la clase. La app real lo carga vía
// @nestjs/core al bootstrapear (main.ts); este spec no pasa por ahí, así
// que hay que importarlo a mano antes del resto.
import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateToothProcedureDto } from './create-tooth-procedure.dto';
import { INJECTION_PAYLOADS } from '../../../../shared/validators/__fixtures__/injection-payloads';

const VALID_PROCEDURE = {
  teeth: [{ number: 16, surfaces: ['occlusal'] }],
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

  it('acepta teeth vacío (tratamientos de arcada/boca completa/sin diente)', async () => {
    const errors = await validateProcedure({ teeth: [] });
    expect(errors).toHaveLength(0);
  });

  it('acepta varios dientes con superficies distintas cada uno', async () => {
    const errors = await validateProcedure({
      teeth: [
        { number: 16, surfaces: ['occlusal'] },
        { number: 17, surfaces: ['mesial', 'distal'] },
      ],
    });
    expect(errors).toHaveLength(0);
  });

  it('rechaza un código de superficie desconocido', async () => {
    const errors = await validateProcedure({
      teeth: [{ number: 16, surfaces: ['inventada'] }],
    });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('acepta quantity para tratamientos por unidad/caja', async () => {
    const errors = await validateProcedure({ teeth: [], quantity: 3 });
    expect(errors).toHaveLength(0);
  });

  it('rechaza quantity menor a 1', async () => {
    const errors = await validateProcedure({ teeth: [], quantity: 0 });
    expect(errors.some((e) => e.property === 'quantity')).toBe(true);
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

  // A diferencia de create-odontogram-entries.dto.ts, teeth[].number acá NO
  // lleva IsFdiToothNumber() (fuera de alcance de CLI-39/CLI-41 para este
  // DTO) — sigue validando solo con @Min(11) @Max(85), así que 19
  // (inexistente en FDI) todavía pasa.
  it('un diente FDI inexistente (19) todavía pasa Min/Max en teeth[].number', async () => {
    const errors = await validateProcedure({ teeth: [{ number: 19 }] });
    expect(errors).toHaveLength(0);
  });

  it('rechaza un número de diente fuera de Min/Max', async () => {
    const errors = await validateProcedure({ teeth: [{ number: 9 }] });
    expect(errors.length).toBeGreaterThan(0);
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
