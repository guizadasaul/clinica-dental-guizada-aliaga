import { Injectable } from '@nestjs/common';
import type { ChatActor } from '../../domain/ChatActor.js';
import type { ChatTool, JsonSchema } from '../../domain/ChatTool.js';
import { AppointmentsService } from '../../../appointments/application/appointments.service.js';
import type { AppointmentWithPatient } from '../../../appointments/domain/AppointmentWithPatient.js';
import type { PatientAppointment } from '../../../appointments/domain/PatientAppointment.js';
import { PatientsService } from '../../../patients/application/patients.service.js';
import { ReportsService } from '../../../reports/application/reports.service.js';
import { reportedAppointmentStatus } from '../../../reports/domain/OperationalReport.js';
import { FinancesService } from '../../../finances/application/finances.service.js';
import type { Quote } from '../../../quotes/domain/Quote.js';
import {
  addDays,
  clinicDate,
  clinicDayStart,
  clinicTime,
  clinicWeekday,
  daysBetween,
  normalizeText,
} from './clinic-time.js';
import {
  AGENDA_STATUSES,
  MyAgendaArgsDto,
  MyMonthArgsDto,
  MyPatientsArgsDto,
  MyPatientSummaryArgsDto,
} from './dto/doctor-tool-args.dto.js';
import type { AgendaStatus } from './dto/doctor-tool-args.dto.js';

/**
 * Tools del odontólogo (CLI-92, ampliadas en CLI-234): solo SU agenda, SUS
 * pacientes asignados y SUS números. Decisión de la épica (CLI-81): en el
 * chat el doctor ve solo lo propio, aunque en la UI cualquier odontólogo vea
 * cualquier ficha. Ningún DTO acepta doctorId ni patientId: el doctor es
 * siempre `actor.userId` y un paciente se busca por nombre DENTRO de sus
 * asignados. Sin historia clínica (antecedentes, notas, odontograma).
 */

const NO_ARGS = Object;
const NO_PARAMETERS: JsonSchema = {
  type: 'object',
  properties: {},
  additionalProperties: false,
};
const MAX_AGENDA_DAYS = 31;
/** Sin fechas: hoy y los 6 días siguientes ("¿qué tengo esta semana?"). */
const DEFAULT_AGENDA_DAYS = 7;
/** Las faltas siempre son pasadas: sin fechas se miran los últimos 30 días. */
const DEFAULT_NO_SHOW_DAYS = 30;
const MAX_AGENDA_ITEMS = 50;
const DEFAULT_PATIENTS = 15;
const MAX_CANDIDATES = 10;
const MAX_SUMMARY_TREATMENTS = 10;
const MAX_DEBTORS = 20;
const TOP_TREATMENTS = 5;

const NOT_A_DOCTOR = { error: 'not_a_doctor' };
const PATIENT_NOT_FOUND = {
  error: 'not_found',
  note: 'Ningún paciente asignado a este odontólogo coincide con ese nombre. Solo se buscan sus pacientes asignados.',
};

/** Estados que ve el doctor; held/expired son reservas sin pagar, no citas. */
const STATUS_LABEL: Record<string, string> = {
  confirmed: 'confirmada',
  attended: 'atendida',
  cancelled: 'cancelada',
  no_show: 'no asistió',
};

const QUOTE_STATUS_LABEL: Record<string, string> = {
  pending: 'pendiente',
  partially_paid: 'pago parcial',
  paid: 'pagado',
};

function doctorIdOf(actor: ChatActor): string | null {
  return actor.kind === 'user' ? actor.userId : null;
}

function round2(amount: number): number {
  return Math.round(amount * 100) / 100;
}

/** Nombre del paciente, o del invitado si todavía no tiene ficha. */
function patientName(appointment: AppointmentWithPatient): string {
  const first = appointment.patientFirstName ?? appointment.guestFirstName;
  const last =
    appointment.patientLastNamePaternal ?? appointment.guestLastNamePaternal;
  return [first, last].filter(Boolean).join(' ') || 'Paciente sin nombre';
}

function agendaView(appointment: AppointmentWithPatient, now: Date) {
  // Una confirmada cuya hora ya pasó cuenta como atendida, igual que en los
  // reportes (reportedAppointmentStatus).
  const status =
    reportedAppointmentStatus(
      appointment.status,
      appointment.appointmentDatetime,
      now,
    ) ?? appointment.status;
  return {
    date: clinicDate(appointment.appointmentDatetime),
    weekday: clinicWeekday(appointment.appointmentDatetime),
    time: clinicTime(appointment.appointmentDatetime),
    patient: patientName(appointment),
    phone: appointment.patientPhone ?? appointment.guestPhone,
    status: STATUS_LABEL[status] ?? status,
    ...(appointment.treatmentName && { treatment: appointment.treatmentName }),
    durationMinutes: appointment.durationMinutes,
  };
}

function visitView(appointment: PatientAppointment) {
  return {
    date: clinicDate(appointment.appointmentDatetime),
    weekday: clinicWeekday(appointment.appointmentDatetime),
    time: clinicTime(appointment.appointmentDatetime),
    ...(appointment.treatmentName && { treatment: appointment.treatmentName }),
  };
}

interface AssignedPatient {
  patientId: string;
  name: string;
  phone: string | null;
}

/** Pacientes con ficha asignados al doctor (patients.assigned_doctor_id, CLI-58). */
async function assignedPatients(
  patientsService: PatientsService,
  doctorId: string,
): Promise<AssignedPatient[]> {
  const rows = await patientsService.findAll(doctorId);
  return rows.flatMap((row) =>
    row.patient
      ? [
          {
            patientId: row.patient.id,
            name: [
              row.patient.firstName,
              row.patient.lastNamePaternal,
              row.patient.lastNameMaternal,
            ]
              .filter(Boolean)
              .join(' '),
            phone: row.phone,
          },
        ]
      : [],
  );
}

/**
 * Pacientes cuyo nombre completo contiene todas las palabras buscadas, sin
 * importar tildes ni mayúsculas ("mendoza", "carla mendoza").
 */
export function matchPatients(
  patients: AssignedPatient[],
  query: string,
): AssignedPatient[] {
  const words = normalizeText(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  return patients.filter((p) => {
    const name = normalizeText(p.name);
    return words.every((word) => name.includes(word));
  });
}

function monthRange(month: string | undefined): {
  month: string;
  from: string;
  to: string;
} {
  const resolved = month ?? clinicDate(new Date()).slice(0, 7);
  const from = `${resolved}-01`;
  const to = addDays(`${addDays(from, 31).slice(0, 7)}-01`, -1);
  return { month: resolved, from, to };
}

function agendaRange(
  args: MyAgendaArgsDto,
  status: AgendaStatus,
): { from: string; to: string } {
  const today = clinicDate(new Date());
  if (!args.from && !args.to && status === 'no_show') {
    return { from: addDays(today, -(DEFAULT_NO_SHOW_DAYS - 1)), to: today };
  }
  const from = args.from ?? today;
  const to =
    args.to ?? (args.from ? from : addDays(from, DEFAULT_AGENDA_DAYS - 1));
  return { from, to };
}

function quoteSummary(quote: Quote) {
  return {
    status: QUOTE_STATUS_LABEL[quote.status] ?? quote.status,
    sharedWithPatient: quote.sharedAt !== null,
    totalBob: round2(quote.totalAmount),
    paidBob: round2(quote.totalPaid),
    balanceBob: round2(quote.balance),
    // Solo lo que falta hacer o pagar: lo realizado y pagado no aporta.
    pendingLines: quote.lines
      .filter((line) => line.performedAt === null || line.pending > 0)
      .map((line) => ({
        treatment: line.treatmentName,
        ...(line.toothNumbers.length > 0 && { teeth: line.toothNumbers }),
        pendingBob: round2(line.pending),
        status: line.performedAt
          ? `realizado el ${clinicDate(line.performedAt)}`
          : 'por realizar',
      })),
  };
}

@Injectable()
export class GetMyAgendaTool implements ChatTool<MyAgendaArgsDto> {
  readonly name = 'get_my_agenda';
  readonly description =
    'Citas de su agenda entre dos fechas, con paciente, tratamiento y estado. Sin fechas: hoy y 6 días más (no_show: los últimos 30 días); un solo día: from = to. Máx. 31 días.';
  readonly parameters: JsonSchema = {
    type: 'object',
    properties: {
      from: { type: 'string', description: 'YYYY-MM-DD' },
      to: { type: 'string', description: 'YYYY-MM-DD inclusive' },
      status: {
        type: 'string',
        enum: [...AGENDA_STATUSES],
        description: 'por defecto confirmed',
      },
    },
    additionalProperties: false,
  };
  readonly argsDto = MyAgendaArgsDto;

  constructor(private readonly appointmentsService: AppointmentsService) {}

  async execute(actor: ChatActor, args: MyAgendaArgsDto): Promise<unknown> {
    const doctorId = doctorIdOf(actor);
    if (!doctorId) return NOT_A_DOCTOR;
    const status: AgendaStatus = args.status ?? 'confirmed';
    const { from, to } = agendaRange(args, status);
    const days = daysBetween(from, to);
    if (days < 0 || days >= MAX_AGENDA_DAYS) {
      return {
        error: 'invalid_range',
        note: 'Rango de 1 a 31 días, con from <= to.',
      };
    }
    const now = new Date();
    const appointments = (
      await this.appointmentsService.getAgenda({
        doctorId,
        ...(status !== 'all' && { status }),
        from: clinicDayStart(from),
        to: clinicDayStart(addDays(to, 1)),
      })
    ).filter((a) => a.status in STATUS_LABEL);
    return {
      from,
      to,
      status,
      total: appointments.length,
      appointments: appointments
        .slice(0, MAX_AGENDA_ITEMS)
        .map((a) => agendaView(a, now)),
    };
  }
}

@Injectable()
export class GetMyNextPatientTool implements ChatTool<object> {
  readonly name = 'get_my_next_patient';
  readonly description =
    'Próximo paciente de este odontólogo: la siguiente cita confirmada desde ahora.';
  readonly parameters = NO_PARAMETERS;
  readonly argsDto = NO_ARGS;

  constructor(private readonly appointmentsService: AppointmentsService) {}

  async execute(actor: ChatActor): Promise<unknown> {
    const doctorId = doctorIdOf(actor);
    if (!doctorId) return NOT_A_DOCTOR;
    const now = new Date();
    const [next] = await this.appointmentsService.getAgenda({
      doctorId,
      status: 'confirmed',
      from: now,
    });
    return next
      ? agendaView(next, now)
      : { none: true, note: 'No tiene citas confirmadas próximas.' };
  }
}

@Injectable()
export class GetMyPatientsTool implements ChatTool<MyPatientsArgsDto> {
  readonly name = 'get_my_patients';
  readonly description =
    'Sus pacientes asignados: cuántos tiene, nombre y teléfono. search: nombre o apellido.';
  readonly parameters: JsonSchema = {
    type: 'object',
    properties: {
      search: { type: 'string', maxLength: 60 },
      limit: { type: 'integer', minimum: 1, maximum: 30 },
    },
    additionalProperties: false,
  };
  readonly argsDto = MyPatientsArgsDto;

  constructor(private readonly patientsService: PatientsService) {}

  async execute(actor: ChatActor, args: MyPatientsArgsDto): Promise<unknown> {
    const doctorId = doctorIdOf(actor);
    if (!doctorId) return NOT_A_DOCTOR;
    const patients = await assignedPatients(this.patientsService, doctorId);
    const shown = args.search ? matchPatients(patients, args.search) : patients;
    return {
      total: patients.length,
      ...(args.search && { matching: shown.length }),
      patients: shown
        .slice(0, args.limit ?? DEFAULT_PATIENTS)
        .map(({ name, phone }) => ({ name, phone })),
    };
  }
}

@Injectable()
export class GetMyPatientSummaryTool implements ChatTool<MyPatientSummaryArgsDto> {
  readonly name = 'get_my_patient_summary';
  readonly description =
    'Resumen de UN paciente suyo por nombre: próxima cita, última visita, faltas, tratamientos hechos, presupuesto y saldo. Si varios coinciden, devuelve candidatos. Sin historia clínica.';
  readonly parameters: JsonSchema = {
    type: 'object',
    properties: { name: { type: 'string', minLength: 2, maxLength: 60 } },
    required: ['name'],
    additionalProperties: false,
  };
  readonly argsDto = MyPatientSummaryArgsDto;

  constructor(
    private readonly patientsService: PatientsService,
    private readonly appointmentsService: AppointmentsService,
    private readonly financesService: FinancesService,
  ) {}

  async execute(
    actor: ChatActor,
    args: MyPatientSummaryArgsDto,
  ): Promise<unknown> {
    const doctorId = doctorIdOf(actor);
    if (!doctorId) return NOT_A_DOCTOR;
    const matches = matchPatients(
      await assignedPatients(this.patientsService, doctorId),
      args.name,
    );
    if (matches.length === 0) return PATIENT_NOT_FOUND;
    if (matches.length > 1) {
      return {
        ambiguous: true,
        candidates: matches.slice(0, MAX_CANDIDATES).map((p) => p.name),
        note: 'Varios pacientes coinciden: pregunta a cuál se refiere (o responde por cada uno si lo pide).',
      };
    }
    const [patient] = matches;
    const [upcoming, visits, procedures, finance] = await Promise.all([
      this.appointmentsService.getPatientAppointments(
        patient.patientId,
        'upcoming',
        1,
      ),
      this.appointmentsService.getPatientVisits(patient.patientId),
      this.patientsService.findToothProcedures(patient.patientId),
      this.financesService.getPatientDetail(patient.patientId),
    ]);
    const attended = visits.filter((v) => v.status !== 'no_show');
    const noShows = visits.filter((v) => v.status === 'no_show');
    const treatments = [...procedures].sort(
      (a, b) => b.procedureDate.getTime() - a.procedureDate.getTime(),
    );
    return {
      name: patient.name,
      phone: patient.phone,
      nextAppointment: upcoming[0] ? visitView(upcoming[0]) : null,
      lastVisit: attended[0] ? visitView(attended[0]) : null,
      visits: attended.length,
      missedAppointments: noShows.length,
      ...(noShows[0] && { lastMissed: visitView(noShows[0]) }),
      treatmentsDone: {
        total: treatments.length,
        latest: treatments.slice(0, MAX_SUMMARY_TREATMENTS).map((t) => ({
          date: clinicDate(t.procedureDate),
          treatment: t.treatmentName,
          ...(t.toothNumber !== null && { tooth: t.toothNumber }),
        })),
      },
      quote: finance.quote ? quoteSummary(finance.quote) : null,
      note: 'missedAppointments = citas a las que "no asistió" (dilo así, no "no-show").',
    };
  }
}

@Injectable()
export class GetMyPatientsWithBalanceTool implements ChatTool<object> {
  readonly name = 'get_my_patients_with_balance';
  readonly description =
    'Sus pacientes con saldo pendiente (quién le debe), de mayor a menor.';
  readonly parameters = NO_PARAMETERS;
  readonly argsDto = NO_ARGS;

  constructor(
    private readonly patientsService: PatientsService,
    private readonly financesService: FinancesService,
  ) {}

  async execute(actor: ChatActor): Promise<unknown> {
    const doctorId = doctorIdOf(actor);
    if (!doctorId) return NOT_A_DOCTOR;
    const [patients, balances] = await Promise.all([
      assignedPatients(this.patientsService, doctorId),
      this.financesService.listPatients(),
    ]);
    const mine = new Set(patients.map((p) => p.patientId));
    const debtors = balances
      .filter((b) => mine.has(b.patientId) && b.balance > 0)
      .sort((a, b) => b.balance - a.balance);
    return {
      total: debtors.length,
      totalBalanceBob: round2(debtors.reduce((sum, b) => sum + b.balance, 0)),
      patients: debtors.slice(0, MAX_DEBTORS).map((b) => ({
        name: b.patientName,
        balanceBob: round2(b.balance),
        ...(b.lastTreatmentAt && {
          lastTreatment: clinicDate(b.lastTreatmentAt),
        }),
      })),
    };
  }
}

@Injectable()
export class GetMyMonthlyStatsTool implements ChatTool<MyMonthArgsDto> {
  readonly name = 'get_my_monthly_stats';
  readonly description =
    'Números del mes SOLO de este odontólogo, no de la clínica: citas por estado, pacientes nuevos, ocupación, cobrado y pendiente (Bs.). Por defecto, el mes actual.';
  readonly parameters: JsonSchema = {
    type: 'object',
    properties: {
      month: { type: 'string', description: 'YYYY-MM' },
    },
    additionalProperties: false,
  };
  readonly argsDto = MyMonthArgsDto;

  constructor(private readonly reportsService: ReportsService) {}

  async execute(actor: ChatActor, args: MyMonthArgsDto): Promise<unknown> {
    const doctorId = doctorIdOf(actor);
    if (!doctorId) return NOT_A_DOCTOR;
    const { month, from, to } = monthRange(args.month);
    const query = { from, to, doctorId };
    const [operational, financial] = await Promise.all([
      this.reportsService.getOperationalReport(query),
      this.reportsService.getFinancialReport(query),
    ]);
    const ops = operational.doctors[0];
    const money = financial.doctors.find((d) => d.doctorId === doctorId);
    const byStatus = ops?.appointmentsByStatus ?? {};
    return {
      scope:
        'Solo este doctor (sus citas y sus pacientes asignados). NO son números de toda la clínica: esos solo los ve el administrador.',
      month,
      appointments: {
        upcomingConfirmed: byStatus['confirmed'] ?? 0,
        attended: byStatus['attended'] ?? 0,
        cancelled: byStatus['cancelled'] ?? 0,
        noShow: byStatus['no_show'] ?? 0,
      },
      newPatients: ops?.newPatients ?? 0,
      occupancyPercent: Math.round((ops?.occupancyRate ?? 0) * 100),
      collectedBob: money?.collected ?? 0,
      pendingBob: money?.pending ?? 0,
      notes: [
        'Cada cita cuenta en un solo estado: upcomingConfirmed son las que todavía no llegaron; attended, las confirmadas cuya hora ya pasó; noShow, las que el doctor marcó como "no asistió" (dilo así, no "no-show"). Para saber quiénes faltaron: get_my_agenda con status no_show.',
        '"Cobrado" es del mes; "pendiente" es el saldo actual de sus pacientes asignados, no solo del mes.',
      ],
    };
  }
}

@Injectable()
export class GetMyTopTreatmentsTool implements ChatTool<MyMonthArgsDto> {
  readonly name = 'get_my_top_treatments';
  readonly description =
    'Tratamientos que más realizó en un mes (por defecto el actual).';
  readonly parameters: JsonSchema = {
    type: 'object',
    properties: {
      month: { type: 'string', description: 'YYYY-MM' },
    },
    additionalProperties: false,
  };
  readonly argsDto = MyMonthArgsDto;

  constructor(private readonly reportsService: ReportsService) {}

  async execute(actor: ChatActor, args: MyMonthArgsDto): Promise<unknown> {
    const doctorId = doctorIdOf(actor);
    if (!doctorId) return NOT_A_DOCTOR;
    const { month, from, to } = monthRange(args.month);
    // doctorId filtra por tooth_procedures.performed_by.
    const report = await this.reportsService.getTopTreatments({
      from,
      to,
      doctorId,
      limit: TOP_TREATMENTS,
    });
    return {
      month,
      treatments: report.treatments.map((t) => ({
        treatment: t.name,
        count: t.count,
      })),
    };
  }
}

export const DOCTOR_TOOLS = [
  GetMyAgendaTool,
  GetMyNextPatientTool,
  GetMyPatientsTool,
  GetMyPatientSummaryTool,
  GetMyPatientsWithBalanceTool,
  GetMyMonthlyStatsTool,
  GetMyTopTreatmentsTool,
];
