import { PrismaReportsRepository } from './prisma-reports.repository';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import type { ReportParams } from '../../domain/OperationalReport';

// 2026-09-07 es lunes en America/La_Paz (verificado con Intl.DateTimeFormat)
// — coincide con weekday=1 de doctor_schedule_blocks/ClinicSchedule.
const RANGE_ONE_DAY: ReportParams = {
  from: new Date('2026-09-07T04:00:00.000Z'), // 2026-09-07T00:00:00-04:00
  to: new Date('2026-09-08T04:00:00.000Z'), // límite exclusivo
};

// "Ahora" en los tests: 10:30 del 2026-09-07 en La Paz. Las confirmadas
// antes de esa hora se reportan como atendidas (CLI-224).
const NOW = new Date('2026-09-07T14:30:00.000Z');

function appointment(doctorId: string, status: string, at: string) {
  return {
    doctor_id: doctorId,
    status,
    appointment_datetime: new Date(at),
  };
}

describe('PrismaReportsRepository', () => {
  let prismaMock: {
    users: { findMany: jest.Mock };
    appointments: { findMany: jest.Mock };
    patients: { groupBy: jest.Mock };
    doctor_schedule_blocks: { findMany: jest.Mock };
    payments: { findMany: jest.Mock };
    quotes: { findMany: jest.Mock };
    tooth_procedures: { groupBy: jest.Mock };
    treatments: { findMany: jest.Mock };
  };
  let repo: PrismaReportsRepository;

  beforeEach(() => {
    prismaMock = {
      users: { findMany: jest.fn() },
      appointments: { findMany: jest.fn().mockResolvedValue([]) },
      patients: { groupBy: jest.fn() },
      doctor_schedule_blocks: { findMany: jest.fn() },
      payments: { findMany: jest.fn() },
      quotes: { findMany: jest.fn() },
      tooth_procedures: { groupBy: jest.fn() },
      treatments: { findMany: jest.fn() },
    };
    repo = new PrismaReportsRepository(prismaMock as unknown as PrismaService);
    jest.useFakeTimers({ now: NOW, doNotFake: ['nextTick', 'queueMicrotask'] });
  });

  afterEach(() => jest.useRealTimers());

  /** getOperationalReport pide las citas dos veces: todas (para contar) y las canceladas (detalle). */
  function mockAppointments(
    all: ReturnType<typeof appointment>[],
    cancelled: unknown[] = [],
  ) {
    prismaMock.appointments.findMany.mockImplementation(
      (args: { where: { status?: string } }) =>
        Promise.resolve(args.where.status === 'cancelled' ? cancelled : all),
    );
  }

  describe('getOperationalReport', () => {
    it('returns an empty report without querying activity when no doctor matches (e.g. bad doctorId filter)', async () => {
      prismaMock.users.findMany.mockResolvedValue([]);

      const result = await repo.getOperationalReport({
        ...RANGE_ONE_DAY,
        doctorId: 'missing',
      });

      expect(result).toEqual({
        from: '2026-09-07',
        to: '2026-09-07',
        doctors: [],
        cancellations: [],
      });
      expect(prismaMock.appointments.findMany).not.toHaveBeenCalled();
      expect(prismaMock.patients.groupBy).not.toHaveBeenCalled();
    });

    it('lista las canceladas del rango con paciente (o invitado), quién canceló y el motivo (CLI-103)', async () => {
      prismaMock.users.findMany.mockResolvedValue([
        { id: 'doctor-1', display_name: 'Juan Perez' },
      ]);
      prismaMock.patients.groupBy.mockResolvedValue([]);
      prismaMock.doctor_schedule_blocks.findMany.mockResolvedValue([]);
      const at = new Date('2026-09-07T14:00:00.000Z');
      const cancelledAt = new Date('2026-09-06T20:00:00.000Z');
      mockAppointments(
        [],
        [
          {
            id: 'appt-1',
            appointment_datetime: at,
            doctor_id: 'doctor-1',
            cancelled_at: cancelledAt,
            cancel_reason: 'viaje',
            guest_first_name: null,
            guest_last_name_paternal: null,
            patients: { first_name: 'Ana', last_name_paternal: 'Arce' },
            users: { display_name: 'Juan Perez' },
            cancelled_by_user: { display_name: 'Juan Perez' },
          },
          {
            id: 'appt-2',
            appointment_datetime: at,
            doctor_id: 'doctor-1',
            cancelled_at: null,
            cancel_reason: null,
            guest_first_name: 'Beto',
            guest_last_name_paternal: null,
            patients: null,
            users: { display_name: 'Juan Perez' },
            cancelled_by_user: null,
          },
        ],
      );

      const result = await repo.getOperationalReport(RANGE_ONE_DAY);

      expect(prismaMock.appointments.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            status: 'cancelled',
            appointment_datetime: {
              gte: RANGE_ONE_DAY.from,
              lt: RANGE_ONE_DAY.to,
            },
            doctor_id: { in: ['doctor-1'] },
          },
        }),
      );
      expect(result.cancellations).toEqual([
        {
          appointmentId: 'appt-1',
          appointmentDatetime: at,
          doctorId: 'doctor-1',
          doctorName: 'Juan Perez',
          patientName: 'Ana Arce',
          cancelledAt,
          cancelledByName: 'Juan Perez',
          cancelReason: 'viaje',
        },
        {
          appointmentId: 'appt-2',
          appointmentDatetime: at,
          doctorId: 'doctor-1',
          doctorName: 'Juan Perez',
          patientName: 'Beto',
          cancelledAt: null,
          cancelledByName: null,
          cancelReason: null,
        },
      ]);
    });

    it('combines appointment status counts, new patients and theoretical slots per doctor', async () => {
      prismaMock.users.findMany.mockResolvedValue([
        { id: 'doctor-1', display_name: 'Juan Perez' },
      ]);
      mockAppointments([
        appointment('doctor-1', 'confirmed', '2026-09-07T13:30:00.000Z'),
        appointment('doctor-1', 'held', '2026-09-07T13:00:00.000Z'),
      ]);
      prismaMock.patients.groupBy.mockResolvedValue([
        { assigned_doctor_id: 'doctor-1', _count: { _all: 3 } },
      ]);
      // Lunes 09:00-10:00 → 2 slots de 30 minutos (09:00, 09:30).
      prismaMock.doctor_schedule_blocks.findMany.mockResolvedValue([
        {
          doctor_id: 'doctor-1',
          weekday: 1,
          start_time: '09:00',
          end_time: '10:00',
        },
      ]);

      const result = await repo.getOperationalReport(RANGE_ONE_DAY);

      expect(prismaMock.appointments.findMany).toHaveBeenCalledWith({
        where: {
          appointment_datetime: {
            gte: RANGE_ONE_DAY.from,
            lt: RANGE_ONE_DAY.to,
          },
          doctor_id: { in: ['doctor-1'] },
        },
        select: { doctor_id: true, status: true, appointment_datetime: true },
      });
      expect(result).toEqual({
        from: '2026-09-07',
        to: '2026-09-07',
        doctors: [
          {
            doctorId: 'doctor-1',
            doctorName: 'Juan Perez',
            appointmentsByStatus: { attended: 1 },
            totalAppointments: 1,
            newPatients: 3,
            theoreticalSlots: 2,
            confirmedAppointments: 1,
            occupancyRate: 0.5,
          },
        ],
        cancellations: [],
      });
    });

    // CLI-224: 4 estados — una confirmada que ya pasó es atendida, y las
    // reservas en espera o vencidas no son citas de la clínica.
    it('reporta confirmadas, atendidas, canceladas y no asistió; sin held ni expired', async () => {
      prismaMock.users.findMany.mockResolvedValue([
        { id: 'doctor-1', display_name: 'Juan Perez' },
      ]);
      mockAppointments([
        appointment('doctor-1', 'confirmed', '2026-09-07T13:00:00.000Z'),
        appointment('doctor-1', 'attended', '2026-09-07T12:00:00.000Z'),
        appointment('doctor-1', 'confirmed', '2026-09-07T15:00:00.000Z'),
        appointment('doctor-1', 'confirmed', '2026-09-07T16:00:00.000Z'),
        appointment('doctor-1', 'no_show', '2026-09-07T12:30:00.000Z'),
        appointment('doctor-1', 'cancelled', '2026-09-07T17:00:00.000Z'),
        appointment('doctor-1', 'held', '2026-09-07T18:00:00.000Z'),
        appointment('doctor-1', 'expired', '2026-09-07T13:30:00.000Z'),
      ]);
      prismaMock.patients.groupBy.mockResolvedValue([]);
      prismaMock.doctor_schedule_blocks.findMany.mockResolvedValue([]);

      const [row] = (await repo.getOperationalReport(RANGE_ONE_DAY)).doctors;

      expect(row.appointmentsByStatus).toEqual({
        confirmed: 2,
        attended: 2,
        no_show: 1,
        cancelled: 1,
      });
      // CLI-154: la cancelada no ocupó la agenda, no suma al total.
      expect(row.totalAppointments).toBe(5);
      expect(row.confirmedAppointments).toBe(4);
    });

    it('reports zeroed rows (occupancyRate 0) for a doctor with no schedule blocks, avoiding division by zero', async () => {
      prismaMock.users.findMany.mockResolvedValue([
        { id: 'doctor-2', display_name: 'Sin Horario' },
      ]);
      prismaMock.patients.groupBy.mockResolvedValue([]);
      prismaMock.doctor_schedule_blocks.findMany.mockResolvedValue([]);

      const result = await repo.getOperationalReport(RANGE_ONE_DAY);

      expect(result.doctors).toEqual([
        {
          doctorId: 'doctor-2',
          doctorName: 'Sin Horario',
          appointmentsByStatus: {},
          totalAppointments: 0,
          newPatients: 0,
          theoreticalSlots: 0,
          confirmedAppointments: 0,
          occupancyRate: 0,
        },
      ]);
    });
  });

  describe('getFinancialReport', () => {
    it('aggregates collected (from payments) and pending (from quotes) per doctor, sorted by name with the unassigned bucket last', async () => {
      prismaMock.payments.findMany.mockResolvedValue([
        {
          amount: 100,
          quotes: { patients: { assigned_doctor_id: 'doctor-1' } },
        },
        {
          amount: 50,
          quotes: { patients: { assigned_doctor_id: 'doctor-2' } },
        },
        { amount: 20, quotes: { patients: { assigned_doctor_id: null } } },
      ]);
      prismaMock.quotes.findMany.mockResolvedValue([
        {
          total_amount: 200,
          patients: { assigned_doctor_id: 'doctor-1' },
          payments: [{ amount: 50 }],
        },
        {
          total_amount: 80,
          patients: { assigned_doctor_id: null },
          payments: [],
        },
        // Sobrepagado (total_amount 30 < pagos 40) → pending se clampea a 0.
        {
          total_amount: 30,
          patients: { assigned_doctor_id: 'doctor-3' },
          payments: [{ amount: 40 }],
        },
      ]);
      prismaMock.users.findMany.mockResolvedValue([
        { id: 'doctor-1', display_name: 'Juan Perez' },
        { id: 'doctor-2', display_name: 'Maria Lopez' },
        { id: 'doctor-3', display_name: 'Carlos Ruiz' },
      ]);

      const result = await repo.getFinancialReport(RANGE_ONE_DAY);

      expect(prismaMock.payments.findMany).toHaveBeenCalledWith({
        where: {
          payment_date: { gte: RANGE_ONE_DAY.from, lt: RANGE_ONE_DAY.to },
        },
        select: {
          amount: true,
          quotes: {
            select: { patients: { select: { assigned_doctor_id: true } } },
          },
        },
      });
      expect(prismaMock.quotes.findMany).toHaveBeenCalledWith({
        where: { status: { not: 'paid' } },
        select: {
          total_amount: true,
          patients: { select: { assigned_doctor_id: true } },
          payments: { select: { amount: true } },
        },
      });
      expect(result).toEqual({
        from: '2026-09-07',
        to: '2026-09-07',
        doctors: [
          {
            doctorId: 'doctor-3',
            doctorName: 'Carlos Ruiz',
            collected: 0,
            pending: 0,
          },
          {
            doctorId: 'doctor-1',
            doctorName: 'Juan Perez',
            collected: 100,
            pending: 150,
          },
          {
            doctorId: 'doctor-2',
            doctorName: 'Maria Lopez',
            collected: 50,
            pending: 0,
          },
          { doctorId: null, doctorName: null, collected: 20, pending: 80 },
        ],
      });
    });

    it('includes a zeroed row for the requested doctorId even with no payments/pending quotes at all', async () => {
      prismaMock.payments.findMany.mockResolvedValue([]);
      prismaMock.quotes.findMany.mockResolvedValue([]);
      prismaMock.users.findMany.mockResolvedValue([
        { id: 'doctor-1', display_name: 'Juan Perez' },
      ]);

      const result = await repo.getFinancialReport({
        ...RANGE_ONE_DAY,
        doctorId: 'doctor-1',
      });

      expect(result.doctors).toEqual([
        {
          doctorId: 'doctor-1',
          doctorName: 'Juan Perez',
          collected: 0,
          pending: 0,
        },
      ]);
    });

    it('filters out other doctors when doctorId is given', async () => {
      prismaMock.payments.findMany.mockResolvedValue([
        {
          amount: 100,
          quotes: { patients: { assigned_doctor_id: 'doctor-1' } },
        },
        {
          amount: 999,
          quotes: { patients: { assigned_doctor_id: 'doctor-2' } },
        },
      ]);
      prismaMock.quotes.findMany.mockResolvedValue([]);
      prismaMock.users.findMany.mockResolvedValue([
        { id: 'doctor-1', display_name: 'Juan Perez' },
      ]);

      const result = await repo.getFinancialReport({
        ...RANGE_ONE_DAY,
        doctorId: 'doctor-1',
      });

      expect(result.doctors).toEqual([
        {
          doctorId: 'doctor-1',
          doctorName: 'Juan Perez',
          collected: 100,
          pending: 0,
        },
      ]);
    });
  });

  describe('getTopTreatments (CLI-93)', () => {
    const SEPTEMBER: ReportParams = {
      from: new Date('2026-09-01T04:00:00.000Z'),
      to: new Date('2026-10-01T04:00:00.000Z'),
    };

    it('agrupa por tratamiento en el rango (fechas de calendario), ordena y nombra', async () => {
      prismaMock.tooth_procedures.groupBy.mockResolvedValue([
        { treatment_id: 't1', _count: { _all: 2 } },
        { treatment_id: 't2', _count: { _all: 1 } },
      ]);
      prismaMock.treatments.findMany.mockResolvedValue([
        { id: 't1', name: 'Resina compuesta' },
      ]);

      const result = await repo.getTopTreatments({ ...SEPTEMBER, limit: 5 });

      expect(prismaMock.tooth_procedures.groupBy).toHaveBeenCalledWith({
        by: ['treatment_id'],
        where: {
          procedure_date: {
            gte: new Date('2026-09-01T00:00:00Z'),
            lte: new Date('2026-09-30T00:00:00Z'),
          },
        },
        _count: { _all: true },
        orderBy: { _count: { treatment_id: 'desc' } },
        take: 5,
      });
      expect(result).toEqual({
        from: '2026-09-01',
        to: '2026-09-30',
        treatments: [
          { treatmentId: 't1', name: 'Resina compuesta', count: 2 },
          { treatmentId: 't2', name: 'Tratamiento', count: 1 },
        ],
      });
    });

    it('con doctorId filtra por quién hizo el procedimiento', async () => {
      prismaMock.tooth_procedures.groupBy.mockResolvedValue([]);

      await repo.getTopTreatments({
        ...SEPTEMBER,
        doctorId: 'doc-1',
        limit: 3,
      });

      const args = (
        prismaMock.tooth_procedures.groupBy.mock.calls as unknown[][]
      )[0][0] as {
        where: Record<string, unknown>;
      };
      expect(args.where).toMatchObject({ performed_by: 'doc-1' });
    });

    it('sin procedimientos no consulta nombres', async () => {
      prismaMock.tooth_procedures.groupBy.mockResolvedValue([]);

      await expect(
        repo.getTopTreatments({ ...SEPTEMBER, limit: 5 }),
      ).resolves.toEqual({
        from: '2026-09-01',
        to: '2026-09-30',
        treatments: [],
      });
      expect(prismaMock.treatments.findMany).not.toHaveBeenCalled();
    });
  });

  describe('getTrends (CLI-199)', () => {
    // 2026-09-07 al 2026-09-09 en La Paz (UTC-4).
    const THREE_DAYS: ReportParams = {
      from: new Date('2026-09-07T04:00:00.000Z'),
      to: new Date('2026-09-10T04:00:00.000Z'),
    };

    function payment(at: string, amount: string, doctorId: string | null) {
      return {
        payment_date: new Date(at),
        amount,
        quotes: { patients: { assigned_doctor_id: doctorId } },
      };
    }

    it('devuelve un día por cada fecha del rango, con citas por estado y cobrado en el huso de la clínica', async () => {
      prismaMock.appointments.findMany.mockResolvedValue([
        // Antes de NOW: atendida; después: confirmada (CLI-224).
        {
          appointment_datetime: new Date('2026-09-07T13:00:00.000Z'),
          status: 'confirmed',
        },
        {
          appointment_datetime: new Date('2026-09-07T15:00:00.000Z'),
          status: 'confirmed',
        },
        {
          appointment_datetime: new Date('2026-09-07T16:30:00.000Z'),
          status: 'expired',
        },
        {
          appointment_datetime: new Date('2026-09-07T16:00:00.000Z'),
          status: 'cancelled',
        },
        // 23:30 del 8 en La Paz = 03:30Z del 9: cuenta para el 8.
        {
          appointment_datetime: new Date('2026-09-09T03:30:00.000Z'),
          status: 'no_show',
        },
      ]);
      prismaMock.payments.findMany.mockResolvedValue([
        payment('2026-09-07T14:00:00.000Z', '100.10', 'doctor-1'),
        payment('2026-09-07T18:00:00.000Z', '0.20', null),
        payment('2026-09-09T20:00:00.000Z', '50', 'doctor-2'),
      ]);

      const result = await repo.getTrends(THREE_DAYS);

      expect(result).toEqual({
        from: '2026-09-07',
        to: '2026-09-09',
        days: [
          {
            date: '2026-09-07',
            appointmentsByStatus: { attended: 1, confirmed: 1, cancelled: 1 },
            collected: 100.3,
          },
          {
            date: '2026-09-08',
            appointmentsByStatus: { no_show: 1 },
            collected: 0,
          },
          { date: '2026-09-09', appointmentsByStatus: {}, collected: 50 },
        ],
      });
      expect(prismaMock.appointments.findMany).toHaveBeenCalledWith({
        where: {
          appointment_datetime: { gte: THREE_DAYS.from, lt: THREE_DAYS.to },
        },
        select: { appointment_datetime: true, status: true },
      });
    });

    it('con doctorId filtra las citas por su doctor y los pagos por el doctor asignado al paciente', async () => {
      prismaMock.appointments.findMany.mockResolvedValue([]);
      prismaMock.payments.findMany.mockResolvedValue([
        payment('2026-09-07T14:00:00.000Z', '100', 'doctor-1'),
        payment('2026-09-07T15:00:00.000Z', '70', 'doctor-2'),
        payment('2026-09-07T16:00:00.000Z', '30', null),
      ]);

      const result = await repo.getTrends({
        ...THREE_DAYS,
        doctorId: 'doctor-1',
      });

      const args = (
        prismaMock.appointments.findMany.mock.calls as unknown[][]
      )[0][0] as {
        where: Record<string, unknown>;
      };
      expect(args.where).toMatchObject({ doctor_id: 'doctor-1' });
      expect(result.days[0].collected).toBe(100);
    });
  });
});
