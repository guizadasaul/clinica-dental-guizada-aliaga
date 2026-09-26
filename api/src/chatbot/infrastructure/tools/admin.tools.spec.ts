import { UserRole } from '../../../auth/domain/value-objects/UserRole';
import type { AppointmentsService } from '../../../appointments/application/appointments.service';
import type { ReportsService } from '../../../reports/application/reports.service';
import type { ChatActor } from '../../domain/ChatActor';
import {
  ADMIN_TOOLS,
  GetClinicAgendaTool,
  GetClinicFinancialReportTool,
  GetClinicOperationalReportTool,
  GetTopTreatmentsTool,
} from './admin.tools';
import { ClassValidatorToolArgsValidator } from './class-validator-tool-args.validator';
import { clinicDate } from './clinic-time';

const admin: ChatActor = {
  kind: 'user',
  userId: 'admin-1',
  role: UserRole.ADMIN,
  patientId: null,
};
const doctor: ChatActor = {
  kind: 'user',
  userId: 'doctor-1',
  role: UserRole.ODONTOLOGIST,
  patientId: null,
};
const SEPTEMBER = { from: '2026-09-01', to: '2026-09-30' };
const DOCTOR_ID = '7c9e6679-7425-40de-944b-e07fc1f90ae7';

describe('admin tools (CLI-93)', () => {
  const reportsService = {
    getOperationalReport: jest.fn(),
    getFinancialReport: jest.fn(),
    getTopTreatments: jest.fn(),
  };
  const appointmentsService = { getAgenda: jest.fn() };
  const reports = reportsService as unknown as ReportsService;
  const appointments = appointmentsService as unknown as AppointmentsService;

  beforeEach(() => jest.clearAllMocks());

  it('exporta las 4 tools de admin', () => {
    expect(ADMIN_TOOLS).toHaveLength(4);
  });

  describe.each([
    [
      'get_clinic_operational_report',
      (a: ChatActor) =>
        new GetClinicOperationalReportTool(reports).execute(a, SEPTEMBER),
    ],
    [
      'get_clinic_financial_report',
      (a: ChatActor) =>
        new GetClinicFinancialReportTool(reports).execute(a, SEPTEMBER),
    ],
    [
      'get_clinic_agenda',
      (a: ChatActor) => new GetClinicAgendaTool(appointments).execute(a, {}),
    ],
    [
      'get_top_treatments',
      (a: ChatActor) => new GetTopTreatmentsTool(reports).execute(a, SEPTEMBER),
    ],
  ])('%s', (_name, run) => {
    it.each<ChatActor>([doctor, { kind: 'anonymous' }])(
      'no ejecuta nada para un actor que no es admin (%p), además de la matriz',
      async (actor) => {
        await expect(run(actor)).resolves.toEqual({ error: 'not_admin' });
        expect(reportsService.getOperationalReport).not.toHaveBeenCalled();
        expect(reportsService.getFinancialReport).not.toHaveBeenCalled();
        expect(reportsService.getTopTreatments).not.toHaveBeenCalled();
        expect(appointmentsService.getAgenda).not.toHaveBeenCalled();
      },
    );
  });

  describe.each([
    ['operational', () => new GetClinicOperationalReportTool(reports)],
    ['financial', () => new GetClinicFinancialReportTool(reports)],
    ['top treatments', () => new GetTopTreatmentsTool(reports)],
  ])('rango del reporte %s', (_name, build) => {
    it.each([
      [{ from: '2026-09-30', to: '2026-09-01' }],
      [{ from: '2025-01-01', to: '2026-09-01' }],
    ])('rechaza %p sin consultar', async (range) => {
      await expect(build().execute(admin, range)).resolves.toMatchObject({
        error: 'invalid_range',
      });
      expect(reportsService.getOperationalReport).not.toHaveBeenCalled();
      expect(reportsService.getFinancialReport).not.toHaveBeenCalled();
      expect(reportsService.getTopTreatments).not.toHaveBeenCalled();
    });
  });

  describe('get_clinic_operational_report', () => {
    it('devuelve filas por doctor, totales y la aclaración de estados', async () => {
      reportsService.getOperationalReport.mockResolvedValue({
        from: '2026-09-01',
        to: '2026-09-30',
        doctors: [
          {
            doctorId: 'd1',
            doctorName: 'Saul Guizada',
            appointmentsByStatus: { confirmed: 5, expired: 1 },
            totalAppointments: 6,
            confirmedAppointments: 5,
            newPatients: 1,
            theoreticalSlots: 100,
            occupancyRate: 0.05,
          },
          {
            doctorId: 'd2',
            doctorName: 'Marylu Aliaga',
            appointmentsByStatus: { confirmed: 2 },
            totalAppointments: 2,
            confirmedAppointments: 2,
            newPatients: 0,
            theoreticalSlots: 50,
            occupancyRate: 0.04,
          },
        ],
      });

      const result = await new GetClinicOperationalReportTool(reports).execute(
        admin,
        { ...SEPTEMBER, doctorId: undefined },
      );

      expect(result).toMatchObject({
        from: '2026-09-01',
        to: '2026-09-30',
        totals: {
          totalAppointments: 8,
          confirmedAppointments: 7,
          newPatients: 1,
        },
        doctors: [
          {
            doctor: 'Saul Guizada',
            occupancyPercent: 5,
            appointmentsByStatus: { confirmed: 5, expired: 1 },
          },
          { doctor: 'Marylu Aliaga', occupancyPercent: 4 },
        ],
      });
      expect(JSON.stringify(result)).toContain('no registra cancelaciones');
      expect(JSON.stringify(result)).not.toContain('d1');
    });
  });

  describe('get_clinic_financial_report', () => {
    it('suma totales, nombra la fila sin doctor y aclara la atribución', async () => {
      reportsService.getFinancialReport.mockResolvedValue({
        from: '2026-09-01',
        to: '2026-09-30',
        doctors: [
          {
            doctorId: 'd1',
            doctorName: 'Saul Guizada',
            collected: 100,
            pending: 130.555,
          },
          { doctorId: null, doctorName: null, collected: 50, pending: 0 },
        ],
      });

      const result = await new GetClinicFinancialReportTool(reports).execute(
        admin,
        {
          ...SEPTEMBER,
          doctorId: DOCTOR_ID,
        },
      );

      expect(reportsService.getFinancialReport).toHaveBeenCalledWith({
        ...SEPTEMBER,
        doctorId: DOCTOR_ID,
      });
      expect(result).toMatchObject({
        totals: { collectedBob: 150, pendingBob: 130.56 },
        doctors: [
          { doctor: 'Saul Guizada', collectedBob: 100, pendingBob: 130.56 },
          { doctor: 'Sin doctor asignado', collectedBob: 50, pendingBob: 0 },
        ],
      });
      expect(JSON.stringify(result)).toContain('doctor asignado al paciente');
    });
  });

  describe('get_clinic_agenda', () => {
    it('sin doctor usa la agenda común del día pedido, en hora de Bolivia', async () => {
      appointmentsService.getAgenda.mockResolvedValue([
        {
          appointmentDatetime: new Date('2026-09-26T13:30:00Z'),
          doctorName: 'Saul Guizada',
          patientFirstName: 'Yanina',
          patientLastNamePaternal: 'Galaburda',
          guestFirstName: null,
          guestLastNamePaternal: null,
        },
        {
          appointmentDatetime: new Date('2026-09-26T14:00:00Z'),
          doctorName: 'Marylu Aliaga',
          patientFirstName: null,
          patientLastNamePaternal: null,
          guestFirstName: null,
          guestLastNamePaternal: null,
        },
      ]);

      const result = await new GetClinicAgendaTool(appointments).execute(
        admin,
        {
          date: '2026-09-26',
        },
      );

      expect(appointmentsService.getAgenda).toHaveBeenCalledWith({
        status: 'confirmed',
        from: new Date('2026-09-26T04:00:00Z'),
        to: new Date('2026-09-27T04:00:00Z'),
      });
      expect(result).toEqual({
        date: '2026-09-26',
        total: 2,
        appointments: [
          {
            time: '09:30',
            doctor: 'Saul Guizada',
            patient: 'Yanina Galaburda',
          },
          {
            time: '10:00',
            doctor: 'Marylu Aliaga',
            patient: 'Paciente sin nombre',
          },
        ],
      });
    });

    it('con doctor filtra por él y sin fecha usa hoy', async () => {
      appointmentsService.getAgenda.mockResolvedValue([]);

      const result = (await new GetClinicAgendaTool(appointments).execute(
        admin,
        {
          doctorId: DOCTOR_ID,
        },
      )) as { date: string };

      expect(result.date).toBe(clinicDate(new Date()));
      expect(appointmentsService.getAgenda).toHaveBeenCalledWith(
        expect.objectContaining({ doctorId: DOCTOR_ID }),
      );
    });
  });

  describe('get_top_treatments', () => {
    it('devuelve nombre y cantidad, con 5 por defecto', async () => {
      reportsService.getTopTreatments.mockResolvedValue({
        from: '2026-09-01',
        to: '2026-09-30',
        treatments: [{ treatmentId: 't1', name: 'Resina compuesta', count: 2 }],
      });

      const result = await new GetTopTreatmentsTool(reports).execute(
        admin,
        SEPTEMBER,
      );

      expect(reportsService.getTopTreatments).toHaveBeenCalledWith({
        ...SEPTEMBER,
        limit: 5,
      });
      expect(result).toMatchObject({
        treatments: [{ treatment: 'Resina compuesta', count: 2 }],
      });
      expect(JSON.stringify(result)).not.toContain('t1');
    });

    it('pasa el límite y el doctor pedidos', async () => {
      reportsService.getTopTreatments.mockResolvedValue({
        from: '2026-09-01',
        to: '2026-09-30',
        treatments: [],
      });

      await new GetTopTreatmentsTool(reports).execute(admin, {
        ...SEPTEMBER,
        limit: 3,
        doctorId: DOCTOR_ID,
      });

      expect(reportsService.getTopTreatments).toHaveBeenCalledWith({
        ...SEPTEMBER,
        limit: 3,
        doctorId: DOCTOR_ID,
      });
    });
  });

  describe('validación de argumentos', () => {
    const validator = new ClassValidatorToolArgsValidator();

    it('exige fechas y valida doctorId y límite', async () => {
      await expect(
        validator.validate(
          new GetClinicOperationalReportTool(reports).argsDto,
          {
            doctorId: 'x',
          },
        ),
      ).resolves.toEqual({ ok: false, fields: ['from', 'to', 'doctorId'] });
      await expect(
        validator.validate(new GetTopTreatmentsTool(reports).argsDto, {
          ...SEPTEMBER,
          limit: 11,
        }),
      ).resolves.toEqual({ ok: false, fields: ['limit'] });
      await expect(
        validator.validate(new GetClinicAgendaTool(appointments).argsDto, {
          date: 'hoy',
        }),
      ).resolves.toEqual({ ok: false, fields: ['date'] });
    });
  });
});
