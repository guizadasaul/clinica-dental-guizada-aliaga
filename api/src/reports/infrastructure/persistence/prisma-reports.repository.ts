import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service.js';
import { UserRole } from '../../../auth/domain/value-objects/UserRole.js';
import {
  buildSlotsForDate,
  groupBlocksByWeekday,
  CLINIC_TIMEZONE,
} from '../../../appointments/domain/ClinicSchedule.js';
import type { WeeklyScheduleBlock } from '../../../appointments/domain/ClinicSchedule.js';
import type {
  AppointmentStatusCounts,
  DoctorOperationalRow,
  OperationalReport,
  ReportParams,
} from '../../domain/OperationalReport.js';
import type {
  DoctorFinancialRow,
  FinancialReport,
} from '../../domain/FinancialReport.js';
import type { IReportsRepository } from '../../domain/ReportsRepository.js';

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
      return { from, to, doctors: [] };
    }

    const doctorIds = doctors.map((d) => d.id);

    const [statusCounts, patientCounts, scheduleBlocks] = await Promise.all([
      this.prisma.appointments.groupBy({
        by: ['doctor_id', 'status'],
        where: {
          appointment_datetime: { gte: params.from, lt: params.to },
          doctor_id: { in: doctorIds },
        },
        _count: { _all: true },
      }),
      // CLI-65: "atendidos" se reporta con los estados reales que existen
      // hoy en appointments (held/confirmed/expired) — no hay ningún flujo
      // que transicione una cita a 'attended' (no existe check-in), así que
      // ese estado nunca aparece poblado. No se inventa ese flujo acá.
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
    ]);

    const statusByDoctor = new Map<string, AppointmentStatusCounts>();
    for (const row of statusCounts) {
      const counts = statusByDoctor.get(row.doctor_id) ?? {};
      counts[row.status] = row._count._all;
      statusByDoctor.set(row.doctor_id, counts);
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
      const totalAppointments = Object.values(appointmentsByStatus).reduce(
        (sum, count) => sum + count,
        0,
      );
      const confirmedAppointments = appointmentsByStatus['confirmed'] ?? 0;

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

    return { from, to, doctors: rows };
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
}
