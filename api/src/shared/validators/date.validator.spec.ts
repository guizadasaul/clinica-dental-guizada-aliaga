import { validate } from 'class-validator';
import { IsNotFutureDate, IsAgeWithin, IsNotBefore } from './date.validator';

function isoDaysFromNow(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function isoYearsAgo(years: number): string {
  const date = new Date();
  date.setFullYear(date.getFullYear() - years);
  return date.toISOString().slice(0, 10);
}

class FutureDateDto {
  @IsNotFutureDate()
  date!: unknown;
}

describe('IsNotFutureDate', () => {
  it('acepta hoy y el pasado', async () => {
    for (const value of [isoDaysFromNow(0), isoDaysFromNow(-1)]) {
      const dto = new FutureDateDto();
      dto.date = value;
      expect(await validate(dto)).toHaveLength(0);
    }
  });

  it('rechaza una fecha futura', async () => {
    const dto = new FutureDateDto();
    dto.date = isoDaysFromNow(1);
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rechaza un valor que no es fecha', async () => {
    const dto = new FutureDateDto();
    dto.date = 'no-es-una-fecha';
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });
});

class AgeDto {
  @IsAgeWithin(0, 120)
  birthDate!: unknown;
}

describe('IsAgeWithin', () => {
  it('acepta una edad dentro del rango', async () => {
    const dto = new AgeDto();
    dto.birthDate = isoYearsAgo(30);
    expect(await validate(dto)).toHaveLength(0);
  });

  it('rechaza una edad fuera del rango (más de 120 años)', async () => {
    const dto = new AgeDto();
    dto.birthDate = isoYearsAgo(150);
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });
});

class RangeDto {
  birthDate!: string;

  @IsNotBefore('birthDate')
  lastDentistVisit!: unknown;
}

describe('IsNotBefore', () => {
  it('acepta una fecha igual o posterior a la de referencia', async () => {
    const dto = new RangeDto();
    dto.birthDate = isoYearsAgo(30);
    dto.lastDentistVisit = isoYearsAgo(1);
    expect(await validate(dto)).toHaveLength(0);
  });

  it('rechaza una fecha anterior a la de referencia (lastDentistVisit antes de nacer)', async () => {
    const dto = new RangeDto();
    dto.birthDate = isoYearsAgo(1);
    dto.lastDentistVisit = isoYearsAgo(30);
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('no aplica si el campo de referencia no está presente', async () => {
    const dto = new RangeDto();
    dto.lastDentistVisit = isoYearsAgo(1);
    expect(await validate(dto)).toHaveLength(0);
  });
});
