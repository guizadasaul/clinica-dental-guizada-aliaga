import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateMyDoctorProfileDto } from './update-my-doctor-profile.dto';
import { UpdateDoctorDto } from './update-doctor.dto';

const block = (weekday: number, start: string, end: string) => ({
  weekday,
  start,
  end,
});

async function scheduleErrors(
  blocks: unknown[],
  Dto = UpdateMyDoctorProfileDto,
) {
  const dto = plainToInstance(Dto, { scheduleBlocks: blocks });
  const errors = await validate(dto, { whitelist: true });
  return errors.filter((e) => e.property === 'scheduleBlocks');
}

// CLI-191: el horario semanal tiene que ser coherente.
describe('IsValidSchedule', () => {
  it('acepta bloques ordenados, de varios días y con dos tramos en un mismo día', async () => {
    expect(
      await scheduleErrors([
        block(1, '08:00', '12:00'),
        block(1, '14:00', '18:00'),
        block(2, '08:00', '12:00'),
      ]),
    ).toEqual([]);
  });

  it('acepta un horario vacío (sin atención)', async () => {
    expect(await scheduleErrors([])).toEqual([]);
  });

  it('acepta bloques que se tocan sin solaparse (12:00 fin y 12:00 inicio)', async () => {
    expect(
      await scheduleErrors([
        block(3, '08:00', '12:00'),
        block(3, '12:00', '18:00'),
      ]),
    ).toEqual([]);
  });

  it.each([
    ['inicio igual al fin', block(1, '09:00', '09:00')],
    ['inicio después del fin', block(1, '18:00', '09:00')],
  ])('rechaza un bloque con %s', async (_, invalid) => {
    const errors = await scheduleErrors([invalid]);

    expect(errors).toHaveLength(1);
    expect(JSON.stringify(errors[0].constraints)).toContain(
      'inicio va antes del fin',
    );
  });

  it('rechaza dos bloques del mismo día que se solapan', async () => {
    const errors = await scheduleErrors([
      block(1, '08:00', '12:00'),
      block(1, '11:00', '15:00'),
    ]);

    expect(errors).toHaveLength(1);
  });

  it('el mismo rango en días distintos no es un solape', async () => {
    expect(
      await scheduleErrors([
        block(1, '08:00', '12:00'),
        block(2, '08:00', '12:00'),
      ]),
    ).toEqual([]);
  });

  it('el administrador tiene la misma regla (UpdateDoctorDto)', async () => {
    const errors = await scheduleErrors(
      [block(1, '18:00', '09:00')],
      UpdateDoctorDto,
    );

    expect(errors).toHaveLength(1);
  });

  it('un formato de hora inválido lo reporta el bloque, no el horario completo', async () => {
    const errors = await scheduleErrors([block(1, '9:00', '12:00')]);

    expect(errors).toHaveLength(1);
    expect(errors[0].children?.length).toBeGreaterThan(0);
  });
});
