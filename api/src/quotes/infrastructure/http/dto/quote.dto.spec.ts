import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AddPaymentDto } from './add-payment.dto';
import { AddQuoteItemDto } from './add-quote-item.dto';
import { CreateQuoteDto } from './create-quote.dto';

async function invalidFields<T extends object>(
  cls: new () => T,
  body: Record<string, unknown>,
): Promise<string[]> {
  const errors = await validate(plainToInstance(cls, body));
  return errors.map((e) => e.property).sort();
}

const TREATMENT_ID = '7c9e6679-7425-40de-944b-e07fc1f90ae7';

describe('AddQuoteItemDto', () => {
  it('solo exige el tratamiento', async () => {
    await expect(
      invalidFields(AddQuoteItemDto, { treatmentId: TREATMENT_ID }),
    ).resolves.toEqual([]);
  });

  it('acepta piezas FDI, precio con dos decimales y cantidad', async () => {
    await expect(
      invalidFields(AddQuoteItemDto, {
        treatmentId: TREATMENT_ID,
        toothNumbers: [11, 85],
        customPrice: 99.99,
        quantity: 2,
      }),
    ).resolves.toEqual([]);
  });

  it.each([
    ['treatmentId', 'consulta'],
    ['toothNumbers', [10]],
    ['toothNumbers', [86]],
    ['toothNumbers', [19]],
    ['toothNumbers', [56]],
    ['toothNumbers', 16],
    ['customPrice', 0],
    ['customPrice', 1.999],
    ['quantity', 0],
  ])('rechaza %s = %p', async (field, value) => {
    await expect(
      invalidFields(AddQuoteItemDto, {
        treatmentId: TREATMENT_ID,
        [field]: value,
      }),
    ).resolves.toEqual([field]);
  });
});

describe('AddPaymentDto (CLI-261: por tratamientos)', () => {
  const LINE = '0b0c1d2e-3f40-4a5b-8c6d-7e8f90a1b2c3';

  it('acepta los tratamientos elegidos con medio y notas opcionales', async () => {
    await expect(
      invalidFields(AddPaymentDto, { lineKeys: [LINE] }),
    ).resolves.toEqual([]);
    await expect(
      invalidFields(AddPaymentDto, {
        lineKeys: [LINE],
        paymentMethod: 'cash',
        notes: 'saldo',
      }),
    ).resolves.toEqual([]);
  });

  it('a mano solo se registra efectivo: el QR BANECO se confirma contra el banco (CLI-159)', async () => {
    await expect(
      invalidFields(AddPaymentDto, { lineKeys: [LINE], paymentMethod: 'qr_baneco' }),
    ).resolves.toEqual(['paymentMethod']);
  });

  it.each([
    ['lineKeys', []],
    ['lineKeys', ['no-es-uuid']],
    ['lineKeys', undefined],
    ['paymentMethod', 'x'.repeat(51)],
    ['notes', 42],
  ])('rechaza %s = %p', async (field, value) => {
    await expect(
      invalidFields(AddPaymentDto, { lineKeys: [LINE], [field]: value }),
    ).resolves.toEqual([field]);
  });
});

describe('CreateQuoteDto', () => {
  it('las notas son opcionales y de texto', async () => {
    await expect(invalidFields(CreateQuoteDto, {})).resolves.toEqual([]);
    await expect(
      invalidFields(CreateQuoteDto, { notes: 123 }),
    ).resolves.toEqual(['notes']);
  });
});
