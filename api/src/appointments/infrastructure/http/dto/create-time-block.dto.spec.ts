import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateTimeBlockDto } from './create-time-block.dto';
import { ListTimeBlocksQueryDto } from './list-time-blocks-query.dto';

async function invalid<T extends object>(
  Dto: new () => T,
  payload: Record<string, unknown>,
) {
  const errors = await validate(plainToInstance(Dto, payload), {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  return errors.map((e) => e.property).sort();
}

const BASE = {
  startsAt: '2026-10-06T14:00:00-04:00',
  endsAt: '2026-10-06T16:00:00-04:00',
};

// CLI-195
describe('CreateTimeBlockDto', () => {
  it('acepta un horario sin motivo y uno con motivo', async () => {
    await expect(invalid(CreateTimeBlockDto, BASE)).resolves.toEqual([]);
    await expect(
      invalid(CreateTimeBlockDto, { ...BASE, reason: 'Curso de ortodoncia' }),
    ).resolves.toEqual([]);
  });

  it('el motivo queda sin espacios de más y uno vacío se trata como no enviado', () => {
    const dto = plainToInstance(CreateTimeBlockDto, {
      ...BASE,
      reason: '  curso   de  ortodoncia ',
    });
    expect(dto.reason).toBe('curso de ortodoncia');
    const empty = plainToInstance(CreateTimeBlockDto, { ...BASE, reason: '' });
    expect(empty.reason).toBeUndefined();
  });

  it.each([
    ['startsAt', 'mañana'],
    ['endsAt', '2026-13-45'],
    ['reason', 'x'.repeat(201)],
    ['reason', '<b>curso</b>'],
  ])('rechaza %s = %p', async (field, value) => {
    await expect(
      invalid(CreateTimeBlockDto, { ...BASE, [field]: value }),
    ).resolves.toEqual([field]);
  });

  it('exige inicio y fin', async () => {
    await expect(
      invalid(CreateTimeBlockDto, { startsAt: BASE.startsAt }),
    ).resolves.toEqual(['endsAt']);
  });

  it('no deja mandar el doctor en el body (sale del token)', async () => {
    await expect(
      invalid(CreateTimeBlockDto, {
        ...BASE,
        doctorId: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
      }),
    ).resolves.toEqual(['doctorId']);
  });
});

describe('ListTimeBlocksQueryDto', () => {
  it('acepta un rango de días y rechaza un formato inválido', async () => {
    await expect(
      invalid(ListTimeBlocksQueryDto, { from: '2026-10-05', to: '2026-10-12' }),
    ).resolves.toEqual([]);
    await expect(
      invalid(ListTimeBlocksQueryDto, { from: '05/10/2026', to: '2026-10-12' }),
    ).resolves.toEqual(['from']);
    await expect(
      invalid(ListTimeBlocksQueryDto, { from: '2026-10-05' }),
    ).resolves.toEqual(['to']);
  });
});
