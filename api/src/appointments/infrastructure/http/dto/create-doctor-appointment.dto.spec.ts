import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateDoctorAppointmentDto } from './create-doctor-appointment.dto';

const PATIENT_ID = '7c9e6679-7425-40de-944b-e07fc1f90ae7';

async function invalidFields(body: Record<string, unknown>): Promise<string[]> {
  const errors = await validate(
    plainToInstance(CreateDoctorAppointmentDto, body),
    { whitelist: true, forbidNonWhitelisted: true },
  );
  return errors.map((e) => e.property).sort();
}

describe('CreateDoctorAppointmentDto (CLI-148)', () => {
  it('acepta paciente y horario, con tratamiento, duración y notas opcionales', async () => {
    await expect(
      invalidFields({
        patientId: PATIENT_ID,
        appointmentDatetime: '2026-10-05T09:00:00-04:00',
        treatmentId: PATIENT_ID,
        durationMinutes: 90,
        notes: 'control de brackets',
      }),
    ).resolves.toEqual([]);
  });

  it('exige paciente UUID y horario ISO', async () => {
    await expect(
      invalidFields({ patientId: 'x', appointmentDatetime: 'mañana' }),
    ).resolves.toEqual(['appointmentDatetime', 'patientId']);
  });

  // CLI-194: duración libre, de 5 en 5, de 5 minutos a 8 horas.
  it.each([5, 15, 45, 75, 90, 270, 480])(
    'acepta una duración de %i minutos',
    async (durationMinutes) => {
      await expect(
        invalidFields({
          patientId: PATIENT_ID,
          appointmentDatetime: '2026-10-05T09:00:00-04:00',
          durationMinutes,
        }),
      ).resolves.toEqual([]);
    },
  );

  it.each([0, 3, 12, 481, 485, -30, 45.5])(
    'rechaza una duración de %s minutos (no es múltiplo de 5 o está fuera de 5 min a 8 h)',
    async (durationMinutes) => {
      await expect(
        invalidFields({
          patientId: PATIENT_ID,
          appointmentDatetime: '2026-10-05T09:00:00-04:00',
          durationMinutes,
        }),
      ).resolves.toEqual(['durationMinutes']);
    },
  );

  it('rechaza un doctorId en el body: el doctor sale siempre del token', async () => {
    await expect(
      invalidFields({
        patientId: PATIENT_ID,
        appointmentDatetime: '2026-10-05T09:00:00-04:00',
        doctorId: PATIENT_ID,
      }),
    ).resolves.toEqual(['doctorId']);
  });

  it('limita el largo de las notas', async () => {
    await expect(
      invalidFields({
        patientId: PATIENT_ID,
        appointmentDatetime: '2026-10-05T09:00:00-04:00',
        notes: 'a'.repeat(501),
      }),
    ).resolves.toEqual(['notes']);
  });
});
