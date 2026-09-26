import { Injectable } from '@nestjs/common';
import { UserRole } from '../../../auth/domain/value-objects/UserRole.js';
import type { ChatActor } from '../../domain/ChatActor.js';
import type { ChatTool, JsonSchema } from '../../domain/ChatTool.js';
import { AppointmentsService } from '../../../appointments/application/appointments.service.js';
import type { AppointmentWithPatient } from '../../../appointments/domain/AppointmentWithPatient.js';
import { ReportsService } from '../../../reports/application/reports.service.js';
import {
  addDays,
  clinicDate,
  clinicDayStart,
  clinicTime,
  daysBetween,
} from './clinic-time.js';
import {
  ClinicAgendaArgsDto,
  ClinicReportArgsDto,
  TopTreatmentsArgsDto,
} from './dto/admin-tool-args.dto.js';

/**
 * Tools del administrador (CLI-93): información de toda la clínica. Reutilizan
 * los reportes de CLI-65 y la agenda común (CLI-110). El admin puede filtrar
 * por cualquier doctor (mismo criterio que la UI, CLI-64/65). Además de la
 * matriz de permisos, cada tool verifica el rol (defensa en profundidad).
 */

const MAX_REPORT_DAYS = 366;
const MAX_AGENDA_ITEMS = 60;
const DEFAULT_TOP_TREATMENTS = 5;

const NOT_ADMIN = { error: 'not_admin' };
const INVALID_RANGE = {
  error: 'invalid_range',
  note: 'Rango de hasta 366 días, con from <= to.',
};

const REPORT_PARAMETERS: JsonSchema = {
  type: 'object',
  properties: {
    from: { type: 'string', description: 'YYYY-MM-DD' },
    to: {
      type: 'string',
      description: 'YYYY-MM-DD inclusive',
    },
    doctorId: {
      type: 'string',
      format: 'uuid',
      description: 'Opcional (ver list_doctors)',
    },
  },
  required: ['from', 'to'],
  additionalProperties: false,
};

function isAdmin(actor: ChatActor): boolean {
  return actor.kind === 'user' && actor.role === UserRole.ADMIN;
}

function validRange(from: string, to: string): boolean {
  const days = daysBetween(from, to);
  return days >= 0 && days < MAX_REPORT_DAYS;
}

function round2(amount: number): number {
  return Math.round(amount * 100) / 100;
}

function patientName(appointment: AppointmentWithPatient): string {
  const first = appointment.patientFirstName ?? appointment.guestFirstName;
  const last =
    appointment.patientLastNamePaternal ?? appointment.guestLastNamePaternal;
  return [first, last].filter(Boolean).join(' ') || 'Paciente sin nombre';
}

@Injectable()
export class GetClinicOperationalReportTool implements ChatTool<ClinicReportArgsDto> {
  readonly name = 'get_clinic_operational_report';
  readonly description =
    'Reporte operativo de la clínica (o de un doctor) entre from y to: citas por estado, pacientes nuevos y ocupación por doctor, con totales.';
  readonly parameters = REPORT_PARAMETERS;
  readonly argsDto = ClinicReportArgsDto;

  constructor(private readonly reportsService: ReportsService) {}

  async execute(actor: ChatActor, args: ClinicReportArgsDto): Promise<unknown> {
    if (!isAdmin(actor)) return NOT_ADMIN;
    if (!validRange(args.from, args.to)) return INVALID_RANGE;
    const report = await this.reportsService.getOperationalReport(args);
    const doctors = report.doctors.map((d) => ({
      doctor: d.doctorName,
      appointmentsByStatus: d.appointmentsByStatus,
      totalAppointments: d.totalAppointments,
      confirmedAppointments: d.confirmedAppointments,
      newPatients: d.newPatients,
      occupancyPercent: Math.round(d.occupancyRate * 100),
    }));
    return {
      from: report.from,
      to: report.to,
      totals: {
        totalAppointments: doctors.reduce((s, d) => s + d.totalAppointments, 0),
        confirmedAppointments: doctors.reduce(
          (s, d) => s + d.confirmedAppointments,
          0,
        ),
        newPatients: doctors.reduce((s, d) => s + d.newPatients, 0),
      },
      doctors,
      notes: [
        'Estados: confirmed = reservas pagadas; held = reserva en curso; expired = reservas que no se pagaron a tiempo. El sistema no registra cancelaciones ni asistencia.',
      ],
    };
  }
}

@Injectable()
export class GetClinicFinancialReportTool implements ChatTool<ClinicReportArgsDto> {
  readonly name = 'get_clinic_financial_report';
  readonly description =
    'Finanzas de la clínica (o de un doctor) en Bs., por doctor y total: cobrado entre from y to, y saldo pendiente actual. Para "cuánto nos deben" manda igual from y to (el mes en curso): el pendiente no cambia con el rango.';
  readonly parameters = REPORT_PARAMETERS;
  readonly argsDto = ClinicReportArgsDto;

  constructor(private readonly reportsService: ReportsService) {}

  async execute(actor: ChatActor, args: ClinicReportArgsDto): Promise<unknown> {
    if (!isAdmin(actor)) return NOT_ADMIN;
    if (!validRange(args.from, args.to)) return INVALID_RANGE;
    const report = await this.reportsService.getFinancialReport(args);
    const doctors = report.doctors.map((d) => ({
      doctor: d.doctorName ?? 'Sin doctor asignado',
      collectedBob: round2(d.collected),
      pendingBob: round2(d.pending),
    }));
    return {
      from: report.from,
      to: report.to,
      totals: {
        collectedBob: round2(doctors.reduce((s, d) => s + d.collectedBob, 0)),
        pendingBob: round2(doctors.reduce((s, d) => s + d.pendingBob, 0)),
      },
      doctors,
      notes: [
        'Cobrado = pagos registrados en el rango. Pendiente = saldo actual de presupuestos sin pagar (no depende del rango).',
        'Cada monto se atribuye al doctor asignado al paciente, no a quien hizo el tratamiento.',
      ],
    };
  }
}

@Injectable()
export class GetClinicAgendaTool implements ChatTool<ClinicAgendaArgsDto> {
  readonly name = 'get_clinic_agenda';
  readonly description =
    'Citas confirmadas de un día (por defecto hoy) de la clínica o de un doctor: hora, doctor y paciente.';
  readonly parameters: JsonSchema = {
    type: 'object',
    properties: {
      date: {
        type: 'string',
        description: 'YYYY-MM-DD, por defecto hoy',
      },
      doctorId: { type: 'string', format: 'uuid' },
    },
    additionalProperties: false,
  };
  readonly argsDto = ClinicAgendaArgsDto;

  constructor(private readonly appointmentsService: AppointmentsService) {}

  async execute(actor: ChatActor, args: ClinicAgendaArgsDto): Promise<unknown> {
    if (!isAdmin(actor)) return NOT_ADMIN;
    const date = args.date ?? clinicDate(new Date());
    // Sin doctorId = agenda común de todos los doctores (CLI-110).
    const appointments = await this.appointmentsService.getAgenda({
      ...(args.doctorId && { doctorId: args.doctorId }),
      status: 'confirmed',
      from: clinicDayStart(date),
      to: clinicDayStart(addDays(date, 1)),
    });
    return {
      date,
      total: appointments.length,
      appointments: appointments.slice(0, MAX_AGENDA_ITEMS).map((a) => ({
        time: clinicTime(a.appointmentDatetime),
        doctor: a.doctorName,
        patient: patientName(a),
      })),
    };
  }
}

@Injectable()
export class GetTopTreatmentsTool implements ChatTool<TopTreatmentsArgsDto> {
  readonly name = 'get_top_treatments';
  readonly description =
    'Tratamientos más realizados (en la clínica o por un doctor) entre from y to, con las piezas tratadas.';
  readonly parameters: JsonSchema = {
    ...REPORT_PARAMETERS,
    properties: {
      ...(REPORT_PARAMETERS['properties'] as object),
      limit: { type: 'integer', minimum: 1, maximum: 10 },
    },
  };
  readonly argsDto = TopTreatmentsArgsDto;

  constructor(private readonly reportsService: ReportsService) {}

  async execute(
    actor: ChatActor,
    args: TopTreatmentsArgsDto,
  ): Promise<unknown> {
    if (!isAdmin(actor)) return NOT_ADMIN;
    if (!validRange(args.from, args.to)) return INVALID_RANGE;
    const report = await this.reportsService.getTopTreatments({
      from: args.from,
      to: args.to,
      limit: args.limit ?? DEFAULT_TOP_TREATMENTS,
      ...(args.doctorId && { doctorId: args.doctorId }),
    });
    return {
      from: report.from,
      to: report.to,
      treatments: report.treatments.map((t) => ({
        treatment: t.name,
        count: t.count,
      })),
      note: 'count = piezas tratadas: una aplicación en varias piezas cuenta una vez por pieza.',
    };
  }
}

export const ADMIN_TOOLS = [
  GetClinicOperationalReportTool,
  GetClinicFinancialReportTool,
  GetClinicAgendaTool,
  GetTopTreatmentsTool,
];
