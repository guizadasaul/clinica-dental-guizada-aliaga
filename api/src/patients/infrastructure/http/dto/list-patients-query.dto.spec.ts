import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ListPatientsQueryDto } from './list-patients-query.dto';

describe('ListPatientsQueryDto', () => {
  it('sin doctorId lista todos', async () => {
    await expect(
      validate(plainToInstance(ListPatientsQueryDto, {})),
    ).resolves.toEqual([]);
  });

  it('acepta un doctorId UUID', async () => {
    await expect(
      validate(
        plainToInstance(ListPatientsQueryDto, {
          doctorId: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
        }),
      ),
    ).resolves.toEqual([]);
  });

  it('rechaza un doctorId que no es UUID', async () => {
    const errors = await validate(
      plainToInstance(ListPatientsQueryDto, { doctorId: 'doctor-1' }),
    );
    expect(errors.map((e) => e.property)).toEqual(['doctorId']);
  });
});
