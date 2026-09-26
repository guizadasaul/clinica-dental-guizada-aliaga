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

  it('solo acepta duraciones múltiplo de 30 min, hasta 4 h', async () => {
    const base = {
      patientId: PATIENT_ID,
      appointmentDatetime: '2026-10-05T09:00:00-04:00',
    };
    await expect(
      invalidFields({ ...base, durationMinutes: 45 }),
    ).resolves.toEqual(['durationMinutes']);
    await expect(
      invalidFields({ ...base, durationMinutes: 270 }),
    ).resolves.toEqual(['durationMinutes']);
  });

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
