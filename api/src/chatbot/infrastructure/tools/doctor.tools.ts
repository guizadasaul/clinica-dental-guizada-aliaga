import { Injectable } from '@nestjs/common';
import type { ChatActor } from '../../domain/ChatActor.js';
import type { ChatTool, JsonSchema } from '../../domain/ChatTool.js';
import { AppointmentsService } from '../../../appointments/application/appointments.service.js';
import type { AppointmentWithPatient } from '../../../appointments/domain/AppointmentWithPatient.js';
import { PatientsService } from '../../../patients/application/patients.service.js';
import { ReportsService } from '../../../reports/application/reports.service.js';
import {
  addDays,
  clinicDate,
  clinicDayStart,
  clinicTime,
  daysBetween,
} from './clinic-time.js';
import {
  MyAgendaArgsDto,
  MyMonthlyStatsArgsDto,
  MyPatientsArgsDto,
} from './dto/doctor-tool-args.dto.js';

/**
 * Tools del odontólogo (CLI-92): solo SU agenda, SUS pacientes asignados y
 * SUS números. Decisión de la épica (CLI-81): en el chat el doctor ve solo lo
 * propio, aunque en la UI cualquier odontólogo vea cualquier ficha. Ningún
 * DTO acepta doctorId: siempre es `actor.userId`. Sin datos clínicos.
 */

const NO_ARGS = Object;
const NO_PARAMETERS: JsonSchema = {
  type: 'object',
  properties: {},
  additionalProperties: false,
};
const MAX_AGENDA_DAYS = 31;
const MAX_AGENDA_ITEMS = 50;
const DEFAULT_PATIENTS = 15;

const NOT_A_DOCTOR = { error: 'not_a_doctor' };

function doctorIdOf(actor: ChatActor): string | null {
  return actor.kind === 'user' ? actor.userId : null;
}

/** Nombre del paciente, o del invitado si todavía no tiene ficha. */
function patientName(appointment: AppointmentWithPatient): string {
  const first = appointment.patientFirstName ?? appointment.guestFirstName;
  const last =
    appointment.patientLastNamePaternal ?? appointment.guestLastNamePaternal;
  return [first, last].filter(Boolean).join(' ') || 'Paciente sin nombre';
}

function agendaView(appointment: AppointmentWithPatient) {
  return {
    date: clinicDate(appointment.appointmentDatetime),
    time: clinicTime(appointment.appointmentDatetime),
    patient: patientName(appointment),
    phone: appointment.patientPhone ?? appointment.guestPhone,
  };
}

@Injectable()
export class GetMyAgendaTool implements ChatTool<MyAgendaArgsDto> {
  readonly name = 'get_my_agenda';
  readonly description =
    'Citas confirmadas de la agenda de este odontólogo entre dos fechas. Sin fechas: hoy. Hasta 31 días.';
  readonly parameters: JsonSchema = {
    type: 'object',
    properties: {
      from: {
        type: 'string',
        description: 'YYYY-MM-DD, por defecto hoy',
      },
      to: {
        type: 'string',
        description: 'YYYY-MM-DD inclusive, por defecto igual a from',
      },
    },
    additionalProperties: false,
  };
  readonly argsDto = MyAgendaArgsDto;

  constructor(private readonly appointmentsService: AppointmentsService) {}

  async execute(actor: ChatActor, args: MyAgendaArgsDto): Promise<unknown> {
    const doctorId = doctorIdOf(actor);
    if (!doctorId) return NOT_A_DOCTOR;
    const from = args.from ?? clinicDate(new Date());
    const to = args.to ?? from;
    const days = daysBetween(from, to);
    if (days < 0 || days >= MAX_AGENDA_DAYS) {
      return {
        error: 'invalid_range',
        note: 'Rango de 1 a 31 días, con from <= to.',
      };
    }
    const appointments = await this.appointmentsService.getAgenda({
      doctorId,
      status: 'confirmed',
      from: clinicDayStart(from),
      to: clinicDayStart(addDays(to, 1)),
    });
    return {
      from,
      to,
      total: appointments.length,
      appointments: appointments.slice(0, MAX_AGENDA_ITEMS).map(agendaView),
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
    const [next] = await this.appointmentsService.getAgenda({
      doctorId,
      status: 'confirmed',
      from: new Date(),
    });
    return next
      ? agendaView(next)
      : { none: true, note: 'No tiene citas confirmadas próximas.' };
  }
}

@Injectable()
export class GetMyPatientsTool implements ChatTool<MyPatientsArgsDto> {
  readonly name = 'get_my_patients';
  readonly description =
    'Pacientes asignados a este odontólogo: nombre y teléfono.';
  readonly parameters: JsonSchema = {
    type: 'object',
    properties: { limit: { type: 'integer', minimum: 1, maximum: 30 } },
    additionalProperties: false,
  };
  readonly argsDto = MyPatientsArgsDto;

  constructor(private readonly patientsService: PatientsService) {}

  async execute(actor: ChatActor, args: MyPatientsArgsDto): Promise<unknown> {
    const doctorId = doctorIdOf(actor);
    if (!doctorId) return NOT_A_DOCTOR;
    // findAll(doctorId) filtra por patients.assigned_doctor_id (CLI-58).
    const patients = (await this.patientsService.findAll(doctorId)).filter(
      (p) => p.patient !== null,
    );
    return {
      total: patients.length,
      patients: patients.slice(0, args.limit ?? DEFAULT_PATIENTS).map((p) => ({
        name: [p.patient?.firstName, p.patient?.lastNamePaternal]
          .filter(Boolean)
          .join(' '),
        phone: p.phone,
      })),
    };
  }
}

@Injectable()
export class GetMyMonthlyStatsTool implements ChatTool<MyMonthlyStatsArgsDto> {
  readonly name = 'get_my_monthly_stats';
  readonly description =
    'Números del mes SOLO de este odontólogo (sus citas y pacientes asignados, NO toda la clínica): citas confirmadas y ya atendidas, pacientes nuevos, ocupación, cobrado y pendiente (Bs.). Por defecto, el mes actual.';
  readonly parameters: JsonSchema = {
    type: 'object',
    properties: {
      month: {
        type: 'string',
        description: 'YYYY-MM',
      },
    },
    additionalProperties: false,
  };
  readonly argsDto = MyMonthlyStatsArgsDto;

  constructor(
    private readonly reportsService: ReportsService,
    private readonly appointmentsService: AppointmentsService,
  ) {}

  async execute(
    actor: ChatActor,
    args: MyMonthlyStatsArgsDto,
  ): Promise<unknown> {
    const doctorId = doctorIdOf(actor);
    if (!doctorId) return NOT_A_DOCTOR;
    const month = args.month ?? clinicDate(new Date()).slice(0, 7);
    const from = `${month}-01`;
    const to = addDays(`${addDays(from, 31).slice(0, 7)}-01`, -1);
    const query = { from, to, doctorId };
    const [operational, financial, past] = await Promise.all([
      this.reportsService.getOperationalReport(query),
      this.reportsService.getFinancialReport(query),
      // No existe el estado "atendida": se aproxima con las confirmadas que
      // ya pasaron (misma semántica documentada en OperationalReport).
      this.appointmentsService.getAgenda({
        doctorId,
        status: 'confirmed',
        from: clinicDayStart(from),
        to: new Date(
          Math.min(Date.now(), clinicDayStart(addDays(to, 1)).getTime()),
        ),
      }),
    ]);
    const ops = operational.doctors[0];
    const money = financial.doctors.find((d) => d.doctorId === doctorId);
    return {
      scope:
        'Solo este doctor (sus citas y sus pacientes asignados). NO son números de toda la clínica: esos solo los ve el administrador.',
      month,
      confirmedAppointments: ops?.confirmedAppointments ?? 0,
      attendedAppointments: past.length,
      newPatients: ops?.newPatients ?? 0,
      occupancyPercent: Math.round((ops?.occupancyRate ?? 0) * 100),
      collectedBob: money?.collected ?? 0,
      pendingBob: money?.pending ?? 0,
      notes: [
        '"Atendidas" = citas confirmadas cuya hora ya pasó (el sistema no registra asistencia).',
        '"Cobrado" y "pendiente" son de los pacientes asignados a este doctor; el pendiente es el saldo actual, no solo del mes.',
      ],
    };
  }
}

export const DOCTOR_TOOLS = [
  GetMyAgendaTool,
  GetMyNextPatientTool,
  GetMyPatientsTool,
  GetMyMonthlyStatsTool,
];
