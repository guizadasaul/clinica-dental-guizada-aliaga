import { UserRole } from '../../../auth/domain/value-objects/UserRole';
import type { AppointmentsService } from '../../../appointments/application/appointments.service';
import { AppointmentWithPatient } from '../../../appointments/domain/AppointmentWithPatient';
import type { PatientAppointment } from '../../../appointments/domain/PatientAppointment';
import type { PatientsService } from '../../../patients/application/patients.service';
import type { ReportsService } from '../../../reports/application/reports.service';
import type { FinancesService } from '../../../finances/application/finances.service';
import type { ChatActor } from '../../domain/ChatActor';
import { ClassValidatorToolArgsValidator } from './class-validator-tool-args.validator';
import { addDays, clinicDate } from './clinic-time';
import {
  DOCTOR_TOOLS,
  GetMyAgendaTool,
  GetMyMonthlyStatsTool,
  GetMyNextPatientTool,
  GetMyPatientsTool,
  GetMyPatientSummaryTool,
  GetMyPatientsWithBalanceTool,
  GetMyTopTreatmentsTool,
  matchPatients,
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
    appointmentDatetime: new Date('2099-09-26T13:30:00Z'), // 09:30 La Paz
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
    treatmentName: null,
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
    30,
    'public_web',
    null,
    a.treatmentName as string | null,
    'nota clínica privada',
    null,
  );
}

function assigned(
  id: string,
  firstName: string,
  lastNamePaternal: string,
  extra: Record<string, unknown> = {},
) {
  return {
    phone: '+59170000000',
    email: `${id}@x.com`,
    patient: {
      id,
      firstName,
      lastNamePaternal,
      lastNameMaternal: null,
      dni: '123',
    },
    ...extra,
  };
}

function visit(
  date: string,
  status: string,
  treatmentName: string | null = null,
): PatientAppointment {
  return {
    id: `v-${date}`,
    appointmentDatetime: new Date(`${date}T14:00:00Z`), // 10:00 La Paz
    durationMinutes: 30,
    doctorName: 'Saul Guizada',
    treatmentName,
    status,
  };
}

describe('doctor tools (CLI-92, CLI-234)', () => {
  const appointmentsService = {
    getAgenda: jest.fn(),
    getPatientAppointments: jest.fn(),
    getPatientVisits: jest.fn(),
  };
  const patientsService = {
    findAll: jest.fn(),
    findToothProcedures: jest.fn(),
  };
  const reportsService = {
    getOperationalReport: jest.fn(),
    getFinancialReport: jest.fn(),
    getTopTreatments: jest.fn(),
  };
  const financesService = {
    getPatientDetail: jest.fn(),
    listPatients: jest.fn(),
  };
  const appointments = appointmentsService as unknown as AppointmentsService;
  const patients = patientsService as unknown as PatientsService;
  const reports = reportsService as unknown as ReportsService;
  const finances = financesService as unknown as FinancesService;

  beforeEach(() => jest.clearAllMocks());

  it('exporta las 7 tools del doctor', () => {
    expect(DOCTOR_TOOLS).toHaveLength(7);
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
      'get_my_patient_summary',
      () =>
        new GetMyPatientSummaryTool(patients, appointments, finances).execute(
          anonymous,
          { name: 'Ana' },
        ),
    ],
    [
      'get_my_patients_with_balance',
      () =>
        new GetMyPatientsWithBalanceTool(patients, finances).execute(anonymous),
    ],
    [
      'get_my_monthly_stats',
      () => new GetMyMonthlyStatsTool(reports).execute(anonymous, {}),
    ],
    [
      'get_my_top_treatments',
      () => new GetMyTopTreatmentsTool(reports).execute(anonymous, {}),
    ],
  ])('%s', (_name, run) => {
    it('sin un usuario autenticado no consulta nada', async () => {
      await expect(run()).resolves.toEqual({ error: 'not_a_doctor' });
      expect(appointmentsService.getAgenda).not.toHaveBeenCalled();
      expect(patientsService.findAll).not.toHaveBeenCalled();
      expect(reportsService.getOperationalReport).not.toHaveBeenCalled();
      expect(reportsService.getTopTreatments).not.toHaveBeenCalled();
      expect(financesService.listPatients).not.toHaveBeenCalled();
    });
  });

  describe('get_my_agenda', () => {
    it('consulta SU agenda confirmada en el rango pedido, con límite exclusivo en hora de Bolivia', async () => {
      appointmentsService.getAgenda.mockResolvedValue([
        appointment({ treatmentName: 'Limpieza' }),
        appointment({
          appointmentDatetime: new Date('2099-09-28T15:00:00Z'),
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
        from: '2099-09-21',
        to: '2099-09-27',
      });

      expect(appointmentsService.getAgenda).toHaveBeenCalledWith({
        doctorId: 'doctor-1',
        status: 'confirmed',
        from: new Date('2099-09-21T04:00:00Z'),
        to: new Date('2099-09-28T04:00:00Z'),
      });
      expect(result).toEqual({
        from: '2099-09-21',
        to: '2099-09-27',
        status: 'confirmed',
        total: 2,
        appointments: [
          {
            date: '2099-09-26',
            weekday: 'sábado',
            time: '09:30',
            patient: 'Yanina Galaburda',
            phone: '+59177842665',
            status: 'confirmada',
            treatment: 'Limpieza',
            durationMinutes: 30,
          },
          {
            date: '2099-09-28',
            weekday: 'lunes',
            time: '11:00',
            patient: 'Invitado Nuevo',
            phone: '+59170000000',
            status: 'confirmada',
            durationMinutes: 30,
          },
        ],
      });
      const json = JSON.stringify(result);
      expect(json).not.toContain('y@x.com');
      expect(json).not.toContain('nota clínica');
    });

    it('sin fechas trae hoy y los 6 días siguientes (con solo hoy, "los próximos días" quedaba vacío)', async () => {
      appointmentsService.getAgenda.mockResolvedValue([]);
      const today = clinicDate(new Date());

      const result = await new GetMyAgendaTool(appointments).execute(
        doctor,
        {},
      );

      expect(result).toMatchObject({ from: today, to: addDays(today, 6) });
    });

    it('con solo "from" trae ese día', async () => {
      appointmentsService.getAgenda.mockResolvedValue([]);

      await expect(
        new GetMyAgendaTool(appointments).execute(doctor, {
          from: '2099-09-26',
        }),
      ).resolves.toMatchObject({ from: '2099-09-26', to: '2099-09-26' });
    });

    it('con status all trae los estados que ve el doctor y etiqueta cada uno', async () => {
      appointmentsService.getAgenda.mockResolvedValue([
        appointment({ appointmentDatetime: new Date('2020-01-06T13:30:00Z') }),
        appointment({ status: 'cancelled' }),
        appointment({ status: 'no_show' }),
        appointment({ status: 'held' }),
        appointment({ status: 'expired' }),
      ]);

      const result = (await new GetMyAgendaTool(appointments).execute(doctor, {
        from: '2099-09-01',
        to: '2099-09-30',
        status: 'all',
      })) as { total: number; appointments: { status: string }[] };

      const filters = (
        appointmentsService.getAgenda.mock.calls as unknown[][]
      )[0][0] as Record<string, unknown>;
      expect(filters).not.toHaveProperty('status');
      expect(result.total).toBe(3);
      // Una confirmada cuya hora ya pasó cuenta como atendida (como en Reportes).
      expect(result.appointments.map((a) => a.status)).toEqual([
        'atendida',
        'cancelada',
        'no asistió',
      ]);
    });

    it('filtra por "no asistió" para saber quién faltó', async () => {
      appointmentsService.getAgenda.mockResolvedValue([]);

      await new GetMyAgendaTool(appointments).execute(doctor, {
        from: '2099-09-01',
        to: '2099-09-30',
        status: 'no_show',
      });

      expect(appointmentsService.getAgenda).toHaveBeenCalledWith(
        expect.objectContaining({ doctorId: 'doctor-1', status: 'no_show' }),
      );
    });

    it('rechaza un rango invertido o de más de 31 días sin consultar', async () => {
      const tool = new GetMyAgendaTool(appointments);

      await expect(
        tool.execute(doctor, { from: '2099-09-10', to: '2099-09-01' }),
      ).resolves.toMatchObject({ error: 'invalid_range' });
      await expect(
        tool.execute(doctor, { from: '2099-09-01', to: '2099-10-15' }),
      ).resolves.toMatchObject({ error: 'invalid_range' });
      expect(appointmentsService.getAgenda).not.toHaveBeenCalled();
    });

    it('nombra genérico un paciente sin nombre y acota a 50 ítems', async () => {
      appointmentsService.getAgenda.mockResolvedValue(
        Array.from({ length: 60 }, () =>
          appointment({
            patientFirstName: null,
            patientLastNamePaternal: null,
          }),
        ),
      );

      const result = (await new GetMyAgendaTool(appointments).execute(doctor, {
        from: '2099-09-01',
        to: '2099-09-30',
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
      )[0][0] as { doctorId: string; status: string; from: Date };
      expect(filters.doctorId).toBe('doctor-1');
      expect(filters.status).toBe('confirmed');
      expect(filters.from.getTime()).toBeGreaterThanOrEqual(before);
      expect(result).toMatchObject({
        date: '2099-09-26',
        weekday: 'sábado',
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
        assigned('p1', 'Yanina', 'Galaburda', { phone: '+59177842665' }),
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
      expect(json).not.toContain('p1@x.com');
    });

    it('busca por nombre sin tildes y sigue diciendo cuántos tiene en total', async () => {
      patientsService.findAll.mockResolvedValue([
        assigned('p1', 'Sofía', 'Quispe'),
        assigned('p2', 'Carla', 'Mendoza'),
      ]);

      await expect(
        new GetMyPatientsTool(patients).execute(doctor, { search: 'sofia' }),
      ).resolves.toEqual({
        total: 2,
        matching: 1,
        patients: [{ name: 'Sofía Quispe', phone: '+59170000000' }],
      });
    });

    it('respeta el límite', async () => {
      patientsService.findAll.mockResolvedValue(
        Array.from({ length: 5 }, (_, i) => assigned(`p${i}`, 'A', 'B')),
      );

      const result = (await new GetMyPatientsTool(patients).execute(doctor, {
        limit: 2,
      })) as { total: number; patients: unknown[] };

      expect(result.total).toBe(5);
      expect(result.patients).toHaveLength(2);
    });
  });

  describe('matchPatients', () => {
    const list = [
      { patientId: '1', name: 'Carla Mendoza', phone: null },
      { patientId: '2', name: 'Jorge Mendoza Rojas', phone: null },
      { patientId: '3', name: 'Sofía Quispe', phone: null },
    ];

    it.each([
      ['mendoza', ['1', '2']],
      ['Carla Mendoza', ['1']],
      ['MENDOZA ROJAS', ['2']],
      ['sofia', ['3']],
      ['Rodrigo', []],
      ['   ', []],
    ])('"%s" → %j', (query, ids) => {
      expect(matchPatients(list, query).map((p) => p.patientId)).toEqual(ids);
    });
  });

  describe('get_my_patient_summary', () => {
    const tool = () =>
      new GetMyPatientSummaryTool(patients, appointments, finances);

    beforeEach(() => {
      patientsService.findAll.mockResolvedValue([
        assigned('p-carla', 'Carla', 'Mendoza'),
        assigned('p-jorge', 'Jorge', 'Mendoza'),
      ]);
    });

    it('busca solo entre SUS pacientes: uno de otro doctor da not_found sin consultar nada más', async () => {
      const result = await tool().execute(doctor, { name: 'Rodrigo Paz' });

      expect(patientsService.findAll).toHaveBeenCalledWith('doctor-1');
      expect(result).toMatchObject({ error: 'not_found' });
      expect(appointmentsService.getPatientVisits).not.toHaveBeenCalled();
      expect(financesService.getPatientDetail).not.toHaveBeenCalled();
    });

    it('si varios coinciden devuelve los candidatos para preguntar cuál', async () => {
      const result = await tool().execute(doctor, { name: 'mendoza' });

      expect(result).toMatchObject({
        ambiguous: true,
        candidates: ['Carla Mendoza', 'Jorge Mendoza'],
      });
      expect(financesService.getPatientDetail).not.toHaveBeenCalled();
    });

    it('arma el resumen: próxima cita, visitas y faltas, tratamientos y lo pendiente del presupuesto', async () => {
      appointmentsService.getPatientAppointments.mockResolvedValue([
        visit('2099-10-09', 'confirmed', 'Resina simple'),
      ]);
      appointmentsService.getPatientVisits.mockResolvedValue([
        visit('2026-10-05', 'no_show'),
        visit('2026-10-03', 'confirmed', 'Limpieza dental'),
        visit('2026-09-01', 'attended'),
      ]);
      patientsService.findToothProcedures.mockResolvedValue([
        {
          procedureDate: new Date('2026-09-01T12:00:00Z'),
          treatmentName: 'Resina simple',
          toothNumber: 16,
          notes: 'privado',
        },
        {
          procedureDate: new Date('2026-10-03T12:00:00Z'),
          treatmentName: 'Limpieza dental',
          toothNumber: null,
        },
      ]);
      financesService.getPatientDetail.mockResolvedValue({
        quote: {
          status: 'partially_paid',
          sharedAt: new Date(),
          totalAmount: 1350,
          totalPaid: 300,
          balance: 1050,
          lines: [
            {
              key: 'k1',
              treatmentName: 'Limpieza dental',
              toothNumbers: [],
              total: 150,
              paid: 150,
              pending: 0,
              performedAt: new Date('2026-10-03T12:00:00Z'),
            },
            {
              key: 'k2',
              treatmentName: 'Endodoncia',
              toothNumbers: [36],
              total: 800,
              paid: 0,
              pending: 800,
              performedAt: null,
            },
          ],
        },
      });

      const result = await tool().execute(doctor, { name: 'carla' });

      expect(appointmentsService.getPatientVisits).toHaveBeenCalledWith(
        'p-carla',
      );
      expect(financesService.getPatientDetail).toHaveBeenCalledWith('p-carla');
      expect(result).toEqual({
        name: 'Carla Mendoza',
        phone: '+59170000000',
        nextAppointment: {
          date: '2099-10-09',
          weekday: 'viernes',
          time: '10:00',
          treatment: 'Resina simple',
        },
        lastVisit: {
          date: '2026-10-03',
          weekday: 'sábado',
          time: '10:00',
          treatment: 'Limpieza dental',
        },
        visits: 2,
        noShows: 1,
        lastNoShow: { date: '2026-10-05', weekday: 'lunes', time: '10:00' },
        treatmentsDone: {
          total: 2,
          latest: [
            { date: '2026-10-03', treatment: 'Limpieza dental' },
            { date: '2026-09-01', treatment: 'Resina simple', tooth: 16 },
          ],
        },
        quote: {
          status: 'pago parcial',
          sharedWithPatient: true,
          totalBob: 1350,
          paidBob: 300,
          balanceBob: 1050,
          pendingLines: [
            {
              treatment: 'Endodoncia',
              teeth: [36],
              pendingBob: 800,
              status: 'por realizar',
            },
          ],
        },
      });
      expect(JSON.stringify(result)).not.toContain('privado');
    });

    it('un paciente sin citas ni presupuesto no rompe el resumen', async () => {
      appointmentsService.getPatientAppointments.mockResolvedValue([]);
      appointmentsService.getPatientVisits.mockResolvedValue([]);
      patientsService.findToothProcedures.mockResolvedValue([]);
      financesService.getPatientDetail.mockResolvedValue({ quote: null });

      await expect(
        tool().execute(doctor, { name: 'Jorge' }),
      ).resolves.toMatchObject({
        name: 'Jorge Mendoza',
        nextAppointment: null,
        lastVisit: null,
        visits: 0,
        noShows: 0,
        quote: null,
      });
    });
  });

  describe('get_my_patients_with_balance', () => {
    it('solo SUS pacientes con saldo, de mayor a menor', async () => {
      patientsService.findAll.mockResolvedValue([
        assigned('p-carla', 'Carla', 'Mendoza'),
        assigned('p-sofia', 'Sofía', 'Quispe'),
        assigned('p-jorge', 'Jorge', 'Mendoza'),
      ]);
      financesService.listPatients.mockResolvedValue([
        { patientId: 'p-sofia', patientName: 'Sofía Quispe', balance: 0 },
        { patientId: 'p-rodrigo', patientName: 'Rodrigo Paz', balance: 1200 },
        {
          patientId: 'p-jorge',
          patientName: 'Jorge Mendoza',
          balance: 100.5,
          lastTreatmentAt: null,
        },
        {
          patientId: 'p-carla',
          patientName: 'Carla Mendoza',
          balance: 1050,
          lastTreatmentAt: new Date('2026-10-03T12:00:00Z'),
        },
      ]);

      const result = await new GetMyPatientsWithBalanceTool(
        patients,
        finances,
      ).execute(doctor);

      expect(patientsService.findAll).toHaveBeenCalledWith('doctor-1');
      expect(result).toEqual({
        total: 2,
        totalBalanceBob: 1150.5,
        patients: [
          {
            name: 'Carla Mendoza',
            balanceBob: 1050,
            lastTreatment: '2026-10-03',
          },
          { name: 'Jorge Mendoza', balanceBob: 100.5 },
        ],
      });
      expect(JSON.stringify(result)).not.toContain('Rodrigo');
    });
  });

  describe('get_my_monthly_stats', () => {
    beforeEach(() => {
      reportsService.getOperationalReport.mockResolvedValue({
        doctors: [
          {
            appointmentsByStatus: {
              confirmed: 2,
              attended: 3,
              cancelled: 1,
              no_show: 1,
            },
            newPatients: 1,
            occupancyRate: 0.1234,
          },
        ],
      });
      reportsService.getFinancialReport.mockResolvedValue({
        doctors: [
          { doctorId: null, collected: 999, pending: 999 },
          { doctorId: 'doctor-1', collected: 100, pending: 130 },
        ],
      });
    });

    it('arma el mes pedido con los reportes filtrados por SU doctorId, con desglose por estado', async () => {
      const result = await new GetMyMonthlyStatsTool(reports).execute(doctor, {
        month: '2026-02',
      });

      const query = {
        from: '2026-02-01',
        to: '2026-02-28',
        doctorId: 'doctor-1',
      };
      expect(reportsService.getOperationalReport).toHaveBeenCalledWith(query);
      expect(reportsService.getFinancialReport).toHaveBeenCalledWith(query);
      expect(result).toMatchObject({
        month: '2026-02',
        appointments: {
          upcomingConfirmed: 2,
          attended: 3,
          cancelled: 1,
          noShow: 1,
        },
        newPatients: 1,
        occupancyPercent: 12,
        collectedBob: 100,
        pendingBob: 130,
      });
      expect((result as { scope: string }).scope).toContain(
        'NO son números de toda la clínica',
      );
      // Desde no_show (CLI-208) el sistema sí registra las faltas.
      expect(JSON.stringify(result)).not.toContain('no registra asistencia');
    });

    it('por defecto usa el mes actual y tolera reportes vacíos', async () => {
      reportsService.getOperationalReport.mockResolvedValue({ doctors: [] });
      reportsService.getFinancialReport.mockResolvedValue({ doctors: [] });

      await expect(
        new GetMyMonthlyStatsTool(reports).execute(doctor, {}),
      ).resolves.toMatchObject({
        month: clinicDate(new Date()).slice(0, 7),
        appointments: {
          upcomingConfirmed: 0,
          attended: 0,
          cancelled: 0,
          noShow: 0,
        },
        newPatients: 0,
        occupancyPercent: 0,
        collectedBob: 0,
        pendingBob: 0,
      });
    });
  });

  describe('get_my_top_treatments', () => {
    it('pide el ranking del mes filtrado por SU doctorId', async () => {
      reportsService.getTopTreatments.mockResolvedValue({
        treatments: [
          { treatmentId: 't1', name: 'Limpieza dental', count: 4 },
          { treatmentId: 't2', name: 'Resina simple', count: 2 },
        ],
      });

      const result = await new GetMyTopTreatmentsTool(reports).execute(doctor, {
        month: '2026-10',
      });

      expect(reportsService.getTopTreatments).toHaveBeenCalledWith({
        from: '2026-10-01',
        to: '2026-10-31',
        doctorId: 'doctor-1',
        limit: 5,
      });
      expect(result).toEqual({
        month: '2026-10',
        treatments: [
          { treatment: 'Limpieza dental', count: 4 },
          { treatment: 'Resina simple', count: 2 },
        ],
      });
    });
  });

  describe('validación de argumentos', () => {
    const validator = new ClassValidatorToolArgsValidator();

    it.each([
      ['get_my_agenda', new GetMyAgendaTool(appointments).argsDto],
      ['get_my_monthly_stats', new GetMyMonthlyStatsTool(reports).argsDto],
      ['get_my_patients', new GetMyPatientsTool(patients).argsDto],
      ['get_my_top_treatments', new GetMyTopTreatmentsTool(reports).argsDto],
    ])('%s no acepta un doctorId', async (_name, dto) => {
      await expect(
        validator.validate(dto, { doctorId: 'otro' }),
      ).resolves.toEqual({ ok: false, fields: ['doctorId'] });
    });

    it('el resumen se pide por nombre, nunca por id', async () => {
      const dto = new GetMyPatientSummaryTool(patients, appointments, finances)
        .argsDto;

      await expect(
        validator.validate(dto, { name: 'Carla', patientId: 'p-otro' }),
      ).resolves.toEqual({ ok: false, fields: ['patientId'] });
      await expect(validator.validate(dto, {})).resolves.toMatchObject({
        ok: false,
      });
    });

    it('valida el estado de la agenda y el formato del mes', async () => {
      await expect(
        validator.validate(new GetMyAgendaTool(appointments).argsDto, {
          status: 'held',
        }),
      ).resolves.toEqual({ ok: false, fields: ['status'] });
      await expect(
        validator.validate(new GetMyMonthlyStatsTool(reports).argsDto, {
          month: '2026-13',
        }),
      ).resolves.toEqual({ ok: false, fields: ['month'] });
    });
  });
});
