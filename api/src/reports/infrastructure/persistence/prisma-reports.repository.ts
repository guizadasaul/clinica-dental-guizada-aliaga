import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service.js';
import { UserRole } from '../../../auth/domain/value-objects/UserRole.js';
import {
  buildSlotsForDate,
  groupBlocksByWeekday,
  CLINIC_TIMEZONE,
} from '../../../appointments/domain/ClinicSchedule.js';
import type { WeeklyScheduleBlock } from '../../../appointments/domain/ClinicSchedule.js';
import { AppointmentStatus } from '../../../appointments/domain/Appointment.js';
import {
  reportedAppointmentStatus,
  type AppointmentStatusCounts,
  type CancelledAppointmentRow,
  type DoctorOperationalRow,
  type OperationalReport,
  type ReportParams,
} from '../../domain/OperationalReport.js';
import type {
  DoctorFinancialRow,
  FinancialReport,
} from '../../domain/FinancialReport.js';
import type { IReportsRepository } from '../../domain/ReportsRepository.js';
import type { TopTreatmentsReport } from '../../domain/TopTreatmentsReport.js';
import type { TrendDay, TrendsReport } from '../../domain/TrendsReport.js';

const DAY_MS = 24 * 60 * 60 * 1000;

const DATE_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: CLINIC_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** YYYY-MM-DD de un instante, en el huso horario de la clínica (en-CA formatea así nativamente). */
function toClinicDateString(instant: Date): string {
  return DATE_FORMATTER.format(instant);
}

/**
 * Fechas de calendario (YYYY-MM-DD, huso de la clínica) cubiertas por
 * [from, toExclusive). Bolivia no tiene horario de verano, así que sumar
 * DAY_MS en UTC es seguro (mismo criterio que addDaysToDateString en
 * appointments/application/appointments.service.ts).
 */
function enumerateDateStrings(from: Date, toExclusive: Date): string[] {
  const days = Math.round((toExclusive.getTime() - from.getTime()) / DAY_MS);
  return Array.from({ length: Math.max(0, days) }, (_, i) =>
    toClinicDateString(new Date(from.getTime() + i * DAY_MS)),
  );
}

/** El último instante (ms) estrictamente anterior al límite exclusivo cae dentro del último día inclusive del rango — usado solo para mostrar `to` de vuelta como YYYY-MM-DD. */
function lastInclusiveDateString(toExclusive: Date): string {
  return toClinicDateString(new Date(toExclusive.getTime() - 1));
}

function fullName(
  first: string | null | undefined,
  last: string | null | undefined,
): string | null {
  return [first, last].filter(Boolean).join(' ') || null;
}

@Injectable()
export class PrismaReportsRepository implements IReportsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async getOperationalReport(params: ReportParams): Promise<OperationalReport> {
    const doctors = await this.prisma.users.findMany({
      where: {
        role: UserRole.ODONTOLOGIST,
        ...(params.doctorId && { id: params.doctorId }),
      },
      select: { id: true, display_name: true },
      orderBy: { display_name: 'asc' },
    });

    const from = toClinicDateString(params.from);
    const to = lastInclusiveDateString(params.to);

    if (doctors.length === 0) {
      return { from, to, doctors: [], cancellations: [] };
    }

    const doctorIds = doctors.map((d) => d.id);

    const [appointments, patientCounts, scheduleBlocks, cancelled] =
      await Promise.all([
        // CLI-224: fecha y estado de cada cita, porque una confirmada se
        // reporta como atendida si su hora ya pasó (ver
        // reportedAppointmentStatus).
        this.prisma.appointments.findMany({
          where: {
            appointment_datetime: { gte: params.from, lt: params.to },
            doctor_id: { in: doctorIds },
          },
          select: { doctor_id: true, status: true, appointment_datetime: true },
        }),
        this.prisma.patients.groupBy({
          by: ['assigned_doctor_id'],
          where: {
            created_at: { gte: params.from, lt: params.to },
            assigned_doctor_id: { in: doctorIds },
          },
          _count: { _all: true },
        }),
        this.prisma.doctor_schedule_blocks.findMany({
          where: { doctor_id: { in: doctorIds } },
        }),
        // CLI-103: mismo rango y doctores que el conteo de canceladas.
        this.prisma.appointments.findMany({
          where: {
            status: AppointmentStatus.CANCELLED,
            appointment_datetime: { gte: params.from, lt: params.to },
            doctor_id: { in: doctorIds },
          },
          select: {
            id: true,
            appointment_datetime: true,
            doctor_id: true,
            cancelled_at: true,
            cancel_reason: true,
            guest_first_name: true,
            guest_last_name_paternal: true,
            patients: {
              select: { first_name: true, last_name_paternal: true },
            },
            users: { select: { display_name: true } },
            cancelled_by_user: { select: { display_name: true } },
          },
          orderBy: { appointment_datetime: 'desc' },
        }),
      ]);

    const now = new Date();
    const statusByDoctor = new Map<string, AppointmentStatusCounts>();
    for (const appointment of appointments) {
      const status = reportedAppointmentStatus(
        appointment.status,
        appointment.appointment_datetime,
        now,
      );
      if (!status) continue;
      const counts = statusByDoctor.get(appointment.doctor_id) ?? {};
      counts[status] = (counts[status] ?? 0) + 1;
      statusByDoctor.set(appointment.doctor_id, counts);
    }

    const newPatientsByDoctor = new Map<string, number>();
    for (const row of patientCounts) {
      if (row.assigned_doctor_id) {
        newPatientsByDoctor.set(row.assigned_doctor_id, row._count._all);
      }
    }

    const blocksByDoctor = new Map<string, WeeklyScheduleBlock[]>();
    for (const block of scheduleBlocks) {
      const list = blocksByDoctor.get(block.doctor_id) ?? [];
      list.push({
        weekday: block.weekday,
        start: block.start_time,
        end: block.end_time,
      });
      blocksByDoctor.set(block.doctor_id, list);
    }

    // Mismo rango de fechas para todos los doctores — se calcula una sola vez.
    const dateStrings = enumerateDateStrings(params.from, params.to);

    const rows: DoctorOperationalRow[] = doctors.map((doctor) => {
      const appointmentsByStatus = statusByDoctor.get(doctor.id) ?? {};
      // CLI-154: una cita cancelada no ocupó la agenda — se informa en
      // appointmentsByStatus.cancelled pero no suma al total.
      const totalAppointments = Object.entries(appointmentsByStatus).reduce(
        (sum, [status, count]) =>
          status === AppointmentStatus.CANCELLED ? sum : sum + count,
        0,
      );
      const confirmedAppointments =
        (appointmentsByStatus['confirmed'] ?? 0) +
        (appointmentsByStatus['attended'] ?? 0);

      const schedule = groupBlocksByWeekday(
        blocksByDoctor.get(doctor.id) ?? [],
      );
      const theoreticalSlots = dateStrings.reduce(
        (sum, date) => sum + buildSlotsForDate(date, schedule).length,
        0,
      );
      const occupancyRate =
        theoreticalSlots > 0
          ? Math.round((confirmedAppointments / theoreticalSlots) * 10000) /
            10000
          : 0;

      return {
        doctorId: doctor.id,
        doctorName: doctor.display_name,
        appointmentsByStatus,
        totalAppointments,
        newPatients: newPatientsByDoctor.get(doctor.id) ?? 0,
        theoreticalSlots,
        confirmedAppointments,
        occupancyRate,
      };
    });

    const cancellations: CancelledAppointmentRow[] = cancelled.map((a) => ({
      appointmentId: a.id,
      appointmentDatetime: a.appointment_datetime,
      doctorId: a.doctor_id,
      doctorName: a.users.display_name,
      patientName: fullName(
        a.patients?.first_name ?? a.guest_first_name,
        a.patients?.last_name_paternal ?? a.guest_last_name_paternal,
      ),
      cancelledAt: a.cancelled_at,
      cancelledByName: a.cancelled_by_user?.display_name ?? null,
      cancelReason: a.cancel_reason,
    }));

    return { from, to, doctors: rows, cancellations };
  }

  async getFinancialReport(params: ReportParams): Promise<FinancialReport> {
    const from = toClinicDateString(params.from);
    const to = lastInclusiveDateString(params.to);

    // Cobrado: agregado directo sobre payments (nunca sobre
    // quotes.total_paid — instrucción explícita de la issue), cruzando
    // payments → quotes → patients.assigned_doctor_id (dos hops, sin
    // columna doctor_id propia en payments).
    const payments = await this.prisma.payments.findMany({
      where: { payment_date: { gte: params.from, lt: params.to } },
      select: {
        amount: true,
        quotes: {
          select: { patients: { select: { assigned_doctor_id: true } } },
        },
      },
    });

    const collectedByDoctor = new Map<string | null, number>();
    for (const payment of payments) {
      const doctorId = payment.quotes.patients.assigned_doctor_id;
      if (params.doctorId && doctorId !== params.doctorId) {
        continue;
      }
      collectedByDoctor.set(
        doctorId,
        (collectedByDoctor.get(doctorId) ?? 0) + Number(payment.amount),
      );
    }

    // Pendiente: saldo actual por quote no pagado (total_amount - suma de
    // sus payments), sin acotar por rango de fechas — es una foto del
    // estado actual, no algo que "pasó" dentro de [from, to).
    const pendingQuotes = await this.prisma.quotes.findMany({
      where: { status: { not: 'paid' } },
      select: {
        total_amount: true,
        patients: { select: { assigned_doctor_id: true } },
        payments: { select: { amount: true } },
      },
    });

    const pendingByDoctor = new Map<string | null, number>();
    for (const quote of pendingQuotes) {
      const doctorId = quote.patients.assigned_doctor_id;
      if (params.doctorId && doctorId !== params.doctorId) {
        continue;
      }
      const paidSoFar = quote.payments.reduce(
        (sum, payment) => sum + Number(payment.amount),
        0,
      );
      // Un quote levemente sobrepagado no debe aparecer como saldo negativo.
      const pendingAmount = Math.max(0, Number(quote.total_amount) - paidSoFar);
      pendingByDoctor.set(
        doctorId,
        (pendingByDoctor.get(doctorId) ?? 0) + pendingAmount,
      );
    }

    const rowKeys = new Set<string | null>([
      ...collectedByDoctor.keys(),
      ...pendingByDoctor.keys(),
    ]);
    // Si se pidió un doctor puntual, la fila aparece igual aunque esté en
    // cero (ej. no cobró ni tiene pendientes en el rango elegido).
    if (params.doctorId) {
      rowKeys.add(params.doctorId);
    }

    const doctorIds = [...rowKeys].filter((id): id is string => id !== null);
    const doctorNames =
      doctorIds.length > 0
        ? await this.prisma.users.findMany({
            where: { id: { in: doctorIds } },
            select: { id: true, display_name: true },
          })
        : [];
    const nameById = new Map(doctorNames.map((d) => [d.id, d.display_name]));

    const rows: DoctorFinancialRow[] = [...rowKeys].map((doctorId) => ({
      doctorId,
      doctorName: doctorId ? (nameById.get(doctorId) ?? null) : null,
      collected: collectedByDoctor.get(doctorId) ?? 0,
      pending: pendingByDoctor.get(doctorId) ?? 0,
    }));
    rows.sort((a, b) =>
      (a.doctorName ?? '￿').localeCompare(b.doctorName ?? '￿'),
    );

    return { from, to, doctors: rows };
  }

  async getTopTreatments(
    params: ReportParams & { limit: number },
  ): Promise<TopTreatmentsReport> {
    const from = toClinicDateString(params.from);
    const to = lastInclusiveDateString(params.to);
    const groups = await this.prisma.tooth_procedures.groupBy({
      by: ['treatment_id'],
      where: {
        // procedure_date es DATE: se compara contra las fechas de calendario
        // de la clínica, no contra instantes.
        procedure_date: {
          gte: new Date(`${from}T00:00:00Z`),
          lte: new Date(`${to}T00:00:00Z`),
        },
        ...(params.doctorId && { performed_by: params.doctorId }),
      },
      _count: { _all: true },
      orderBy: { _count: { treatment_id: 'desc' } },
      take: params.limit,
    });
    if (groups.length === 0) {
      return { from, to, treatments: [] };
    }
    const names = await this.prisma.treatments.findMany({
      where: { id: { in: groups.map((g) => g.treatment_id) } },
      select: { id: true, name: true },
    });
    const nameById = new Map(names.map((t) => [t.id, t.name]));
    return {
      from,
      to,
      treatments: groups.map((g) => ({
        treatmentId: g.treatment_id,
        name: nameById.get(g.treatment_id) ?? 'Tratamiento',
        count: g._count._all,
      })),
    };
  }

  /**
   * Serie diaria (CLI-199): citas por estado según la fecha de la cita, y
   * cobrado según la fecha del pago — ambas en el huso de la clínica. El
   * filtro por doctor sigue el mismo criterio que los otros reportes: la cita
   * por su doctor, el pago por el doctor asignado al paciente del presupuesto.
   */
  async getTrends(params: ReportParams): Promise<TrendsReport> {
    const from = toClinicDateString(params.from);
    const to = lastInclusiveDateString(params.to);

    const [appointments, payments] = await Promise.all([
      this.prisma.appointments.findMany({
        where: {
          appointment_datetime: { gte: params.from, lt: params.to },
          ...(params.doctorId && { doctor_id: params.doctorId }),
        },
        select: { appointment_datetime: true, status: true },
      }),
      this.prisma.payments.findMany({
        where: { payment_date: { gte: params.from, lt: params.to } },
        select: {
          payment_date: true,
          amount: true,
          quotes: {
            select: { patients: { select: { assigned_doctor_id: true } } },
          },
        },
      }),
    ]);

    const days = new Map<string, TrendDay>(
      enumerateDateStrings(params.from, params.to).map((date) => [
        date,
        { date, appointmentsByStatus: {}, collected: 0 },
      ]),
    );

    const now = new Date();
    for (const appointment of appointments) {
      const status = reportedAppointmentStatus(
        appointment.status,
        appointment.appointment_datetime,
        now,
      );
      const day = days.get(
        toClinicDateString(appointment.appointment_datetime),
      );
      if (status && day) {
        day.appointmentsByStatus[status] =
          (day.appointmentsByStatus[status] ?? 0) + 1;
      }
    }

    for (const payment of payments) {
      const doctorId = payment.quotes.patients.assigned_doctor_id;
      if (params.doctorId && doctorId !== params.doctorId) {
        continue;
      }
      const day = days.get(toClinicDateString(payment.payment_date));
      if (day) {
        // Redondeo a centavos: sumar Decimals como number acumula error binario.
        day.collected =
          Math.round((day.collected + Number(payment.amount)) * 100) / 100;
      }
    }

    return { from, to, days: [...days.values()] };
  }
}
