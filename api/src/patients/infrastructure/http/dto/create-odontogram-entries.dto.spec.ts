// @Type() (class-transformer, usado por CreateOdontogramEntriesDto.entries
// para el ValidateNested anidado) necesita el polyfill de Reflect.metadata
// ya cargado al momento de decorar la clase. La app real lo carga vía
// @nestjs/core al bootstrapear (main.ts); este spec no pasa por ahí, así
// que hay que importarlo a mano antes del resto.
import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateOdontogramEntriesDto } from './create-odontogram-entries.dto';
import { INJECTION_PAYLOADS } from '../../../../shared/validators/__fixtures__/injection-payloads';

const VALID_ENTRY = {
  toothNumber: 11,
  toothType: 'permanent',
  toothCondition: 'sano',
  diagnosisDescription: 'Diente sano',
};

const VALID_PAYLOAD = { entries: [VALID_ENTRY] };

async function validateEntries(entries: Record<string, unknown>[]) {
  const dto = plainToInstance(CreateOdontogramEntriesDto, { entries });
  return validate(dto);
}

function flatten(
  errors: Awaited<ReturnType<typeof validate>>,
): { property: string; parent: string }[] {
  const out: { property: string; parent: string }[] = [];
  for (const error of errors) {
    for (const child of error.children ?? []) {
      for (const grandchild of child.children ?? []) {
        out.push({ property: grandchild.property, parent: child.property });
      }
      out.push({ property: child.property, parent: error.property });
    }
    out.push({ property: error.property, parent: '' });
  }
  return out;
}

describe('CreateOdontogramEntriesDto', () => {
  it('acepta un envío válido', async () => {
    const dto = plainToInstance(CreateOdontogramEntriesDto, VALID_PAYLOAD);
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('rechaza entries: [] (ArrayMinSize)', async () => {
    const errors = await validateEntries([]);
    expect(errors.some((e) => e.property === 'entries')).toBe(true);
  });

  it('rechaza más de 52 entries (ArrayMaxSize)', async () => {
    const entries = Array.from({ length: 53 }, (_, i) => ({
      ...VALID_ENTRY,
      toothNumber: 11,
      // toothNumber se repite a propósito: lo que importa acá es el tamaño
      // del array, no la unicidad (esa la cubre otro test).
      __index: i,
    }));
    const errors = await validateEntries(entries);
    expect(errors.some((e) => e.property === 'entries')).toBe(true);
  });

  it('rechaza dientes repetidos en el mismo envío', async () => {
    const errors = await validateEntries([VALID_ENTRY, VALID_ENTRY]);
    expect(errors.some((e) => e.property === 'entries')).toBe(true);
  });

  it('rechaza diagnosisDescription vacío', async () => {
    const errors = await validateEntries([
      { ...VALID_ENTRY, diagnosisDescription: '' },
    ]);
    expect(
      flatten(errors).some((e) => e.property === 'diagnosisDescription'),
    ).toBe(true);
  });

  it('rechaza diagnosisDescription de menos de 3 caracteres', async () => {
    const errors = await validateEntries([
      { ...VALID_ENTRY, diagnosisDescription: 'ab' },
    ]);
    expect(
      flatten(errors).some((e) => e.property === 'diagnosisDescription'),
    ).toBe(true);
  });

  it.each([[19], [20], [39], [56], [79]])(
    'rechaza el diente inexistente %i',
    async (toothNumber) => {
      const errors = await validateEntries([
        { ...VALID_ENTRY, toothNumber, toothType: undefined },
      ]);
      expect(flatten(errors).some((e) => e.property === 'toothNumber')).toBe(
        true,
      );
    },
  );

  it('rechaza toothType incoherente con el cuadrante de toothNumber', async () => {
    const errors = await validateEntries([
      { ...VALID_ENTRY, toothNumber: 11, toothType: 'deciduous' },
    ]);
    expect(flatten(errors).some((e) => e.property === 'toothType')).toBe(true);
  });

  it('acepta toothType coherente para un diente temporal', async () => {
    const errors = await validateEntries([
      {
        ...VALID_ENTRY,
        toothNumber: 55,
        toothType: 'deciduous',
      },
    ]);
    expect(errors).toHaveLength(0);
  });

  it('rechaza un customPrice negativo', async () => {
    const errors = await validateEntries([
      { ...VALID_ENTRY, customPrice: -10 },
    ]);
    expect(flatten(errors).some((e) => e.property === 'customPrice')).toBe(
      true,
    );
  });

  it('rechaza un customPrice con más de 2 decimales', async () => {
    const errors = await validateEntries([
      { ...VALID_ENTRY, customPrice: 10.123 },
    ]);
    expect(flatten(errors).some((e) => e.property === 'customPrice')).toBe(
      true,
    );
  });

  it('rechaza un customPrice por encima del máximo de la columna Decimal(10,2)', async () => {
    const errors = await validateEntries([
      { ...VALID_ENTRY, customPrice: 100000000 },
    ]);
    expect(flatten(errors).some((e) => e.property === 'customPrice')).toBe(
      true,
    );
  });

  it('acepta un customPrice válido', async () => {
    const errors = await validateEntries([
      { ...VALID_ENTRY, customPrice: 150.5 },
    ]);
    expect(errors).toHaveLength(0);
  });

  it('rechaza notes más largo que 500 caracteres', async () => {
    const errors = await validateEntries([
      { ...VALID_ENTRY, notes: 'a'.repeat(501) },
    ]);
    expect(flatten(errors).some((e) => e.property === 'notes')).toBe(true);
  });

  it('rechaza HTML en notes', async () => {
    const errors = await validateEntries([
      { ...VALID_ENTRY, notes: '<script>alert(1)</script>' },
    ]);
    expect(flatten(errors).some((e) => e.property === 'notes')).toBe(true);
  });

  it('rechaza un toothCondition fuera del enum cerrado', async () => {
    const errors = await validateEntries([
      { ...VALID_ENTRY, toothCondition: 'roto' },
    ]);
    expect(flatten(errors).some((e) => e.property === 'toothCondition')).toBe(
      true,
    );
  });

  // treatmentId es el único campo de la entry con formato estricto (UUID) —
  // los payloads de inyección clásicos nunca son UUIDs válidos.
  describe.each(INJECTION_PAYLOADS)('payload de inyección: %s', (payload) => {
    it('rechaza el payload en treatmentId', async () => {
      const errors = await validateEntries([
        { ...VALID_ENTRY, treatmentId: payload },
      ]);
      expect(flatten(errors).some((e) => e.property === 'treatmentId')).toBe(
        true,
      );
    });
  });
});
