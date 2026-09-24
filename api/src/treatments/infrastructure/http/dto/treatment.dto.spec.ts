import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateTreatmentDto } from './create-treatment.dto';
import { UpdateTreatmentDto } from './update-treatment.dto';

const VALID = {
  code: 'limpieza',
  name: 'Limpieza',
  basePrice: 150.5,
  applicationType: 'full_mouth',
  currency: 'BOB',
  categoryCode: 'preventiva',
};

async function invalidFields(
  cls: typeof CreateTreatmentDto | typeof UpdateTreatmentDto,
  body: Record<string, unknown>,
): Promise<string[]> {
  const errors = await validate(plainToInstance(cls, body));
  return errors.map((e) => e.property).sort();
}

describe('CreateTreatmentDto', () => {
  it('acepta un tratamiento con los campos obligatorios', async () => {
    await expect(invalidFields(CreateTreatmentDto, VALID)).resolves.toEqual([]);
  });

  it('acepta los opcionales válidos', async () => {
    await expect(
      invalidFields(CreateTreatmentDto, {
        ...VALID,
        description: 'Profilaxis',
        estimatedMinutes: 45,
        displayOrder: 0,
        isActive: false,
      }),
    ).resolves.toEqual([]);
  });

  it('exige los obligatorios', async () => {
    await expect(invalidFields(CreateTreatmentDto, {})).resolves.toEqual([
      'applicationType',
      'basePrice',
      'categoryCode',
      'code',
      'currency',
      'name',
    ]);
  });

  it.each([
    ['basePrice', 0],
    ['basePrice', 10.123],
    ['applicationType', 'toda_la_boca'],
    ['currency', 'EUR'],
    ['estimatedMinutes', 0],
    ['displayOrder', -1],
    ['isActive', 'si'],
    ['code', 'x'.repeat(51)],
  ])('rechaza %s = %p', async (field, value) => {
    await expect(
      invalidFields(CreateTreatmentDto, { ...VALID, [field]: value }),
    ).resolves.toEqual([field]);
  });
});

describe('UpdateTreatmentDto', () => {
  it('todo es opcional, pero lo que viene se valida', async () => {
    await expect(invalidFields(UpdateTreatmentDto, {})).resolves.toEqual([]);
    await expect(
      invalidFields(UpdateTreatmentDto, { basePrice: -5 }),
    ).resolves.toEqual(['basePrice']);
  });
});
