import { PrismaReportsRepository } from './prisma-reports.repository';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import type { ReportParams } from '../../domain/OperationalReport';

// 2026-09-07 es lunes en America/La_Paz (verificado con Intl.DateTimeFormat)
// — coincide con weekday=1 de doctor_schedule_blocks/ClinicSchedule.
const RANGE_ONE_DAY: ReportParams = {
  from: new Date('2026-09-07T04:00:00.000Z'), // 2026-09-07T00:00:00-04:00
  to: new Date('2026-09-08T04:00:00.000Z'), // límite exclusivo
};

describe('PrismaReportsRepository', () => {
  let prismaMock: {
    users: { findMany: jest.Mock };
    appointments: { groupBy: jest.Mock };
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
      appointments: { groupBy: jest.fn() },
      patients: { groupBy: jest.fn() },
      doctor_schedule_blocks: { findMany: jest.fn() },
      payments: { findMany: jest.fn() },
      quotes: { findMany: jest.fn() },
      tooth_procedures: { groupBy: jest.fn() },
      treatments: { findMany: jest.fn() },
    };
    repo = new PrismaReportsRepository(prismaMock as unknown as PrismaService);
  });

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
      });
      expect(prismaMock.appointments.groupBy).not.toHaveBeenCalled();
      expect(prismaMock.patients.groupBy).not.toHaveBeenCalled();
    });

    it('combines appointment status counts, new patients and theoretical slots per doctor', async () => {
      prismaMock.users.findMany.mockResolvedValue([
        { id: 'doctor-1', display_name: 'Juan Perez' },
      ]);
      prismaMock.appointments.groupBy.mockResolvedValue([
        { doctor_id: 'doctor-1', status: 'confirmed', _count: { _all: 1 } },
        { doctor_id: 'doctor-1', status: 'held', _count: { _all: 1 } },
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

      expect(prismaMock.appointments.groupBy).toHaveBeenCalledWith({
        by: ['doctor_id', 'status'],
        where: {
          appointment_datetime: {
            gte: RANGE_ONE_DAY.from,
            lt: RANGE_ONE_DAY.to,
          },
          doctor_id: { in: ['doctor-1'] },
        },
        _count: { _all: true },
      });
      expect(result).toEqual({
        from: '2026-09-07',
        to: '2026-09-07',
        doctors: [
          {
            doctorId: 'doctor-1',
            doctorName: 'Juan Perez',
            appointmentsByStatus: { confirmed: 1, held: 1 },
            totalAppointments: 2,
            newPatients: 3,
            theoreticalSlots: 2,
            confirmedAppointments: 1,
            occupancyRate: 0.5,
          },
        ],
      });
    });

    it('reports zeroed rows (occupancyRate 0) for a doctor with no schedule blocks, avoiding division by zero', async () => {
      prismaMock.users.findMany.mockResolvedValue([
        { id: 'doctor-2', display_name: 'Sin Horario' },
      ]);
      prismaMock.appointments.groupBy.mockResolvedValue([]);
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
});
