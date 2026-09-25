import { UserRole } from '../../../auth/domain/value-objects/UserRole';
import type { AppointmentsService } from '../../../appointments/application/appointments.service';
import { AppointmentWithPatient } from '../../../appointments/domain/AppointmentWithPatient';
import type { PatientsService } from '../../../patients/application/patients.service';
import type { ReportsService } from '../../../reports/application/reports.service';
import type { ChatActor } from '../../domain/ChatActor';
import { ClassValidatorToolArgsValidator } from './class-validator-tool-args.validator';
import { clinicDate } from './clinic-time';
import {
  DOCTOR_TOOLS,
  GetMyAgendaTool,
  GetMyMonthlyStatsTool,
  GetMyNextPatientTool,
  GetMyPatientsTool,
} from './doctor.tools';

const doctor: ChatActor = {
  kind: 'user',
  userId: 'doctor-1',
  role: UserRole.ODONTOLOGIST,
  patientId: null,
};
const anonymous: ChatActor = { kind: 'anonymous' };

function appointment(
  overrides: Partial<Record<keyof AppointmentWithPatient, unknown>> = {},
): AppointmentWithPatient {
  const a = {
    id: 'appt-1',
    appointmentDatetime: new Date('2026-09-26T13:30:00Z'), // 09:30 La Paz
    status: 'confirmed',
    patientId: 'patient-1',
    patientFirstName: 'Yanina',
    patientLastNamePaternal: 'Galaburda',
    patientPhone: '+59177842665',
    patientEmail: 'y@x.com',
    guestFirstName: null,
    guestLastNamePaternal: null,
    guestPhone: null,
    doctorId: 'doctor-1',
    doctorName: 'Saul Guizada',
    doctorColor: '#000',
    ...overrides,
  };
  return new AppointmentWithPatient(
    a.id,
    a.appointmentDatetime as Date,
    a.status as string,
    a.patientId as string | null,
    a.patientFirstName as string | null,
    a.patientLastNamePaternal as string | null,
    a.patientPhone as string | null,
    a.patientEmail as string | null,
    a.guestFirstName as string | null,
    a.guestLastNamePaternal as string | null,
    a.guestPhone as string | null,
    a.doctorId as string,
    a.doctorName as string | null,
    a.doctorColor as string | null,
  );
}

describe('doctor tools (CLI-92)', () => {
  const appointmentsService = { getAgenda: jest.fn() };
  const patientsService = { findAll: jest.fn() };
  const reportsService = {
    getOperationalReport: jest.fn(),
    getFinancialReport: jest.fn(),
  };
  const appointments = appointmentsService as unknown as AppointmentsService;
  const patients = patientsService as unknown as PatientsService;
  const reports = reportsService as unknown as ReportsService;

  beforeEach(() => jest.clearAllMocks());

  it('exporta las 4 tools del doctor', () => {
    expect(DOCTOR_TOOLS).toHaveLength(4);
  });

  describe.each([
    [
      'get_my_agenda',
      () => new GetMyAgendaTool(appointments).execute(anonymous, {}),
    ],
    [
      'get_my_next_patient',
      () => new GetMyNextPatientTool(appointments).execute(anonymous),
    ],
    [
      'get_my_patients',
      () => new GetMyPatientsTool(patients).execute(anonymous, {}),
    ],
    [
      'get_my_monthly_stats',
      () =>
        new GetMyMonthlyStatsTool(reports, appointments).execute(anonymous, {}),
    ],
  ])('%s', (_name, run) => {
    it('sin un usuario autenticado no consulta nada', async () => {
      await expect(run()).resolves.toEqual({ error: 'not_a_doctor' });
      expect(appointmentsService.getAgenda).not.toHaveBeenCalled();
      expect(patientsService.findAll).not.toHaveBeenCalled();
      expect(reportsService.getOperationalReport).not.toHaveBeenCalled();
    });
  });

  describe('get_my_agenda', () => {
    it('consulta SU agenda confirmada en el rango pedido, con límite exclusivo en hora de Bolivia', async () => {
      appointmentsService.getAgenda.mockResolvedValue([
        appointment(),
        appointment({
          appointmentDatetime: new Date('2026-09-28T15:00:00Z'),
          patientId: null,
          patientFirstName: null,
          patientLastNamePaternal: null,
          patientPhone: null,
          guestFirstName: 'Invitado',
          guestLastNamePaternal: 'Nuevo',
          guestPhone: '+59170000000',
        }),
      ]);

      const result = await new GetMyAgendaTool(appointments).execute(doctor, {
        from: '2026-09-21',
        to: '2026-09-27',
      });

      expect(appointmentsService.getAgenda).toHaveBeenCalledWith({
        doctorId: 'doctor-1',
        status: 'confirmed',
        from: new Date('2026-09-21T04:00:00Z'),
        to: new Date('2026-09-28T04:00:00Z'),
      });
      expect(result).toEqual({
        from: '2026-09-21',
        to: '2026-09-27',
        total: 2,
        appointments: [
          {
            date: '2026-09-26',
            time: '09:30',
            patient: 'Yanina Galaburda',
            phone: '+59177842665',
          },
          {
            date: '2026-09-28',
            time: '11:00',
            patient: 'Invitado Nuevo',
            phone: '+59170000000',
          },
        ],
      });
      expect(JSON.stringify(result)).not.toContain('y@x.com');
    });

    it('sin fechas usa la agenda de hoy', async () => {
      appointmentsService.getAgenda.mockResolvedValue([]);
      const today = clinicDate(new Date());

      const result = (await new GetMyAgendaTool(appointments).execute(
        doctor,
        {},
      )) as {
        from: string;
        to: string;
      };

      expect(result.from).toBe(today);
      expect(result.to).toBe(today);
    });

    it('rechaza un rango invertido o de más de 31 días sin consultar', async () => {
      const tool = new GetMyAgendaTool(appointments);

      await expect(
        tool.execute(doctor, { from: '2026-09-10', to: '2026-09-01' }),
      ).resolves.toMatchObject({ error: 'invalid_range' });
      await expect(
        tool.execute(doctor, { from: '2026-09-01', to: '2026-10-15' }),
      ).resolves.toMatchObject({ error: 'invalid_range' });
      expect(appointmentsService.getAgenda).not.toHaveBeenCalled();
    });

    it('nombra genérico un turno sin nombre y acota a 50 ítems', async () => {
      appointmentsService.getAgenda.mockResolvedValue(
        Array.from({ length: 60 }, () =>
          appointment({
            patientFirstName: null,
            patientLastNamePaternal: null,
          }),
        ),
      );

      const result = (await new GetMyAgendaTool(appointments).execute(doctor, {
        from: '2026-09-01',
        to: '2026-09-30',
      })) as { total: number; appointments: Array<{ patient: string }> };

      expect(result.total).toBe(60);
      expect(result.appointments).toHaveLength(50);
      expect(result.appointments[0].patient).toBe('Paciente sin nombre');
    });
  });

  describe('get_my_next_patient', () => {
    it('trae la próxima confirmada desde ahora de SU agenda', async () => {
      appointmentsService.getAgenda.mockResolvedValue([appointment()]);
      const before = Date.now();

      const result = await new GetMyNextPatientTool(appointments).execute(
        doctor,
      );

      const filters = (
        appointmentsService.getAgenda.mock.calls as unknown[][]
      )[0][0] as {
        doctorId: string;
        status: string;
        from: Date;
      };
      expect(filters.doctorId).toBe('doctor-1');
      expect(filters.status).toBe('confirmed');
      expect(filters.from.getTime()).toBeGreaterThanOrEqual(before);
      expect(result).toEqual({
        date: '2026-09-26',
        time: '09:30',
        patient: 'Yanina Galaburda',
        phone: '+59177842665',
      });
    });

    it('sin citas próximas lo dice', async () => {
      appointmentsService.getAgenda.mockResolvedValue([]);

      await expect(
        new GetMyNextPatientTool(appointments).execute(doctor),
      ).resolves.toMatchObject({ none: true });
    });
  });

  describe('get_my_patients', () => {
    it('lista SUS pacientes asignados con nombre y teléfono, sin datos clínicos', async () => {
      patientsService.findAll.mockResolvedValue([
        {
          phone: '+59177842665',
          email: 'y@x.com',
          patient: {
            firstName: 'Yanina',
            lastNamePaternal: 'Galaburda',
            dni: '123',
          },
        },
        { phone: null, email: null, patient: null },
      ]);

      const result = await new GetMyPatientsTool(patients).execute(doctor, {});

      expect(patientsService.findAll).toHaveBeenCalledWith('doctor-1');
      expect(result).toEqual({
        total: 1,
        patients: [{ name: 'Yanina Galaburda', phone: '+59177842665' }],
      });
      const json = JSON.stringify(result);
      expect(json).not.toContain('123');
      expect(json).not.toContain('y@x.com');
    });

    it('respeta el límite', async () => {
      patientsService.findAll.mockResolvedValue(
        Array.from({ length: 5 }, () => ({
          phone: null,
          patient: { firstName: 'A', lastNamePaternal: 'B' },
        })),
      );

      const result = (await new GetMyPatientsTool(patients).execute(doctor, {
        limit: 2,
      })) as { total: number; patients: unknown[] };

      expect(result.total).toBe(5);
      expect(result.patients).toHaveLength(2);
    });
  });

  describe('get_my_monthly_stats', () => {
    beforeEach(() => {
      reportsService.getOperationalReport.mockResolvedValue({
        doctors: [
          { confirmedAppointments: 5, newPatients: 1, occupancyRate: 0.1234 },
        ],
      });
      reportsService.getFinancialReport.mockResolvedValue({
        doctors: [
          { doctorId: null, collected: 999, pending: 999 },
          { doctorId: 'doctor-1', collected: 100, pending: 130 },
        ],
      });
      appointmentsService.getAgenda.mockResolvedValue([
        appointment(),
        appointment(),
        appointment(),
      ]);
    });

    it('arma el mes pedido con los reportes filtrados por SU doctorId y aclara el alcance', async () => {
      const result = await new GetMyMonthlyStatsTool(
        reports,
        appointments,
      ).execute(doctor, {
        month: '2026-02',
      });

      expect(reportsService.getOperationalReport).toHaveBeenCalledWith({
        from: '2026-02-01',
        to: '2026-02-28',
        doctorId: 'doctor-1',
      });
      expect(reportsService.getFinancialReport).toHaveBeenCalledWith({
        from: '2026-02-01',
        to: '2026-02-28',
        doctorId: 'doctor-1',
      });
      expect(result).toMatchObject({
        month: '2026-02',
        confirmedAppointments: 5,
        attendedAppointments: 3,
        newPatients: 1,
        occupancyPercent: 12,
        collectedBob: 100,
        pendingBob: 130,
      });
      expect((result as { scope: string }).scope).toContain(
        'NO son números de toda la clínica',
      );
    });

    it('cuenta como atendidas solo las confirmadas ya pasadas del mes', async () => {
      await new GetMyMonthlyStatsTool(reports, appointments).execute(doctor, {
        month: '2026-12',
      });

      const filters = (
        appointmentsService.getAgenda.mock.calls as unknown[][]
      )[0][0] as {
        from: Date;
        to: Date;
      };
      expect(filters.from).toEqual(new Date('2026-12-01T04:00:00Z'));
      expect(filters.to.getTime()).toBeLessThanOrEqual(
        new Date('2027-01-01T04:00:00Z').getTime(),
      );
    });

    it('por defecto usa el mes actual y tolera reportes vacíos', async () => {
      reportsService.getOperationalReport.mockResolvedValue({ doctors: [] });
      reportsService.getFinancialReport.mockResolvedValue({ doctors: [] });
      appointmentsService.getAgenda.mockResolvedValue([]);

      const result = await new GetMyMonthlyStatsTool(
        reports,
        appointments,
      ).execute(doctor, {});

      expect(result).toMatchObject({
        month: clinicDate(new Date()).slice(0, 7),
        confirmedAppointments: 0,
        attendedAppointments: 0,
        newPatients: 0,
        occupancyPercent: 0,
        collectedBob: 0,
        pendingBob: 0,
      });
    });
  });

  describe('validación de argumentos', () => {
    const validator = new ClassValidatorToolArgsValidator();

    it('ninguna tool del doctor acepta un doctorId', async () => {
      await expect(
        validator.validate(new GetMyAgendaTool(appointments).argsDto, {
          doctorId: 'otro',
        }),
      ).resolves.toEqual({ ok: false, fields: ['doctorId'] });
      await expect(
        validator.validate(
          new GetMyMonthlyStatsTool(reports, appointments).argsDto,
          {
            doctorId: 'otro',
          },
        ),
      ).resolves.toEqual({ ok: false, fields: ['doctorId'] });
      await expect(
        validator.validate(new GetMyNextPatientTool(appointments).argsDto, {
          doctorId: 'otro',
        }),
      ).resolves.toEqual({ ok: false, fields: ['doctorId'] });
    });

    it('valida formatos de fecha, mes y límite', async () => {
      await expect(
        validator.validate(new GetMyAgendaTool(appointments).argsDto, {
          from: 'mañana',
        }),
      ).resolves.toEqual({ ok: false, fields: ['from'] });
      await expect(
        validator.validate(
          new GetMyMonthlyStatsTool(reports, appointments).argsDto,
          {
            month: '2026-13',
          },
        ),
      ).resolves.toEqual({ ok: false, fields: ['month'] });
      await expect(
        validator.validate(new GetMyPatientsTool(patients).argsDto, {
          limit: 31,
        }),
      ).resolves.toEqual({ ok: false, fields: ['limit'] });
    });
  });
});
