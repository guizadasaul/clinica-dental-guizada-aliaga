import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AvailabilityQueryDto } from './availability-query.dto';
import { AvailabilityRangeQueryDto } from './availability-range-query.dto';
import { HoldSlotDto } from './hold-slot.dto';

const DOCTOR_ID = '7c9e6679-7425-40de-944b-e07fc1f90ae7';

async function invalidFields<T extends object>(
  cls: new () => T,
  body: Record<string, unknown>,
): Promise<string[]> {
  const errors = await validate(plainToInstance(cls, body));
  return errors.map((e) => e.property).sort();
}

describe('AvailabilityQueryDto', () => {
  it('acepta un doctor y una fecha YYYY-MM-DD', async () => {
    await expect(
      invalidFields(AvailabilityQueryDto, {
        doctorId: DOCTOR_ID,
        date: '2026-09-24',
      }),
    ).resolves.toEqual([]);
  });

  it('rechaza un doctor que no es UUID y una fecha con otro formato', async () => {
    await expect(
      invalidFields(AvailabilityQueryDto, {
        doctorId: 'doctor-1',
        date: '24/09/2026',
      }),
    ).resolves.toEqual(['date', 'doctorId']);
  });
});

describe('AvailabilityRangeQueryDto', () => {
  const valid = { doctorId: DOCTOR_ID, from: '2026-09-24' };

  it('days es opcional', async () => {
    await expect(
      invalidFields(AvailabilityRangeQueryDto, valid),
    ).resolves.toEqual([]);
  });

  it('convierte days del query string a número', () => {
    const dto = plainToInstance(AvailabilityRangeQueryDto, {
      ...valid,
      days: '7',
    });

    expect(dto.days).toBe(7);
  });

  it.each(['0', '15', '2.5', 'abc'])(
    'rechaza days=%s (entero de 1 a 14)',
    async (days) => {
      await expect(
        invalidFields(AvailabilityRangeQueryDto, { ...valid, days }),
      ).resolves.toEqual(['days']);
    },
  );

  it('rechaza un from con otro formato', async () => {
    await expect(
      invalidFields(AvailabilityRangeQueryDto, { ...valid, from: '2026-9-4' }),
    ).resolves.toEqual(['from']);
  });
});

describe('HoldSlotDto', () => {
  const valid = { doctorId: DOCTOR_ID, slot: '2026-09-24T13:00:00Z' };

  it('acepta un horario ISO 8601, con o sin tratamiento', async () => {
    await expect(invalidFields(HoldSlotDto, valid)).resolves.toEqual([]);
    await expect(
      invalidFields(HoldSlotDto, { ...valid, treatmentId: DOCTOR_ID }),
    ).resolves.toEqual([]);
  });

  it('rechaza un horario que no es ISO 8601 estricto y un tratamiento que no es UUID', async () => {
    await expect(
      invalidFields(HoldSlotDto, {
        ...valid,
        slot: '2026-02-30T13:00:00Z',
        treatmentId: 'consulta',
      }),
    ).resolves.toEqual(['slot', 'treatmentId']);
  });
});
