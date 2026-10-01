import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { RescheduleDoctorAppointmentDto } from './reschedule-doctor-appointment.dto';
import { CancelDoctorAppointmentDto } from './cancel-doctor-appointment.dto';

async function invalidFields<T extends object>(
  cls: new () => T,
  body: Record<string, unknown>,
): Promise<string[]> {
  const errors = await validate(plainToInstance(cls, body), {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  return errors.map((e) => e.property).sort();
}

describe('RescheduleDoctorAppointmentDto (CLI-149)', () => {
  it('acepta solo el horario nuevo, o con duración y notas', async () => {
    await expect(
      invalidFields(RescheduleDoctorAppointmentDto, {
        appointmentDatetime: '2026-10-05T09:00:00-04:00',
      }),
    ).resolves.toEqual([]);
    await expect(
      invalidFields(RescheduleDoctorAppointmentDto, {
        appointmentDatetime: '2026-10-05T09:00:00-04:00',
        durationMinutes: 120,
        notes: '',
      }),
    ).resolves.toEqual([]);
  });

  it('rechaza horario inválido, duración fuera de la lista y cambiar de paciente', async () => {
    await expect(
      invalidFields(RescheduleDoctorAppointmentDto, {
        appointmentDatetime: 'mañana',
        durationMinutes: 45,
        patientId: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
      }),
    ).resolves.toEqual(['appointmentDatetime', 'durationMinutes', 'patientId']);
  });
});

describe('CancelDoctorAppointmentDto (CLI-149)', () => {
  it('el motivo es opcional y corto', async () => {
    await expect(
      invalidFields(CancelDoctorAppointmentDto, {}),
    ).resolves.toEqual([]);
    await expect(
      invalidFields(CancelDoctorAppointmentDto, { reason: 'a'.repeat(201) }),
    ).resolves.toEqual(['reason']);
  });
});
