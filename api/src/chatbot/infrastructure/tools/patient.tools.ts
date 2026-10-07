import { Injectable } from '@nestjs/common';
import type { ChatActor } from '../../domain/ChatActor.js';
import type { ChatTool, JsonSchema } from '../../domain/ChatTool.js';
import { AppointmentsService } from '../../../appointments/application/appointments.service.js';
import type { PatientAppointment } from '../../../appointments/domain/PatientAppointment.js';
import { QuotesService } from '../../../quotes/application/quotes.service.js';
import type { Quote } from '../../../quotes/domain/Quote.js';
import type { QuoteLine } from '../../../quotes/domain/QuoteBalance.js';
import { PatientsService } from '../../../patients/application/patients.service.js';
import { clinicDate, clinicTime, clinicWeekday } from './clinic-time.js';
import {
  MyAppointmentsArgsDto,
  MyTreatmentsArgsDto,
  MyVisitsArgsDto,
} from './dto/patient-tool-args.dto.js';

/**
 * Tools del paciente (CLI-91, ampliadas en CLI-235): solo su propia
 * información. El patientId sale SIEMPRE de `actor.patientId`, que resolvió
 * el backend a partir del token (users → patients.user_id); ningún DTO
 * acepta un id. Las salidas son mínimas: sin notas, sin historia clínica,
 * sin ids internos.
 */

const NO_ARGS = Object;
const NO_PARAMETERS: JsonSchema = {
  type: 'object',
  properties: {},
  additionalProperties: false,
};
const MAX_QUOTES = 5;
const DEFAULT_APPOINTMENTS = 5;
const DEFAULT_TREATMENTS = 10;
const DEFAULT_VISITS = 10;

const NO_PROFILE = {
  error: 'no_patient_profile',
  note: 'El usuario todavía no tiene ficha de paciente en la clínica.',
};

// En vivo el modelo ofrecía "si deseas pagar, avísame" (CLI-145): el bot no
// cobra. Desde CLI-218 el paciente sí puede pagar con QR en "Mi presupuesto".
const PAYMENT_NOTE =
  'El asistente no cobra: el saldo se paga con QR desde "Mi presupuesto" en la web, o en la clínica (efectivo, QR o transferencia).';

// Visto en los evals (CLI-235): el modelo escribía "(cita 1, línea 2)".
const NUMBERS_NOTE =
  'quote y line son referencias para elegir qué pagar: no las muestres.';

const QUOTE_STATUS_LABEL: Record<string, string> = {
  pending: 'pendiente',
  partially_paid: 'pago parcial',
  paid: 'pagado',
};

function patientIdOf(actor: ChatActor): string | null {
  return actor.kind === 'user' ? actor.patientId : null;
}

function round2(amount: number): number {
  return Math.round(amount * 100) / 100;
}

function appointmentView(appointment: PatientAppointment) {
  return {
    date: clinicDate(appointment.appointmentDatetime),
    weekday: clinicWeekday(appointment.appointmentDatetime),
    time: clinicTime(appointment.appointmentDatetime),
    doctor: appointment.doctorName,
    treatment: appointment.treatmentName,
    durationMinutes: appointment.durationMinutes,
  };
}

/**
 * Una línea del presupuesto (CLI-218: los grupos multi-diente ya vienen
 * juntos) con su número dentro del presupuesto. El número es lo que usa el
 * paciente para elegir qué pagar: el LLM nunca maneja las keys, que son
 * UUIDs (CLI-235).
 */
function lineView(line: QuoteLine, number: number) {
  return {
    line: number,
    treatment: line.treatmentName,
    ...(line.toothNumbers.length > 0 && { teeth: line.toothNumbers }),
    totalBob: round2(line.total),
    paidBob: round2(line.paid),
    pendingBob: round2(line.pending),
    status: line.performedAt
      ? `realizado el ${clinicDate(line.performedAt)}`
      : 'por realizar',
  };
}

/** Presupuestos numerados del más reciente (1) al más antiguo. */
function quoteView(quote: Quote, number: number) {
  return {
    quote: number,
    date: clinicDate(quote.createdAt),
    status: QUOTE_STATUS_LABEL[quote.status] ?? quote.status,
    totalBob: round2(quote.totalAmount),
    paidBob: round2(quote.totalPaid),
    balanceBob: round2(quote.balance),
    lines: quote.lines.map((line, index) => lineView(line, index + 1)),
  };
}

@Injectable()
export class GetMyNextAppointmentTool implements ChatTool<object> {
  readonly name = 'get_my_next_appointment';
  readonly description =
    'Próxima cita confirmada del paciente: fecha, hora, doctor y tratamiento.';
  readonly parameters = NO_PARAMETERS;
  readonly argsDto = NO_ARGS;

  constructor(private readonly appointmentsService: AppointmentsService) {}

  async execute(actor: ChatActor): Promise<unknown> {
    const patientId = patientIdOf(actor);
    if (!patientId) return NO_PROFILE;
    const [next] = await this.appointmentsService.getPatientAppointments(
      patientId,
      'upcoming',
      1,
    );
    return next
      ? appointmentView(next)
      : { none: true, note: 'No tiene citas próximas confirmadas.' };
  }
}

@Injectable()
export class GetMyAppointmentsTool implements ChatTool<MyAppointmentsArgsDto> {
  readonly name = 'get_my_appointments';
  readonly description =
    'Citas confirmadas del paciente: próximas (upcoming) o anteriores (past). Para su historial con faltas, get_my_visits.';
  readonly parameters: JsonSchema = {
    type: 'object',
    properties: {
      scope: { type: 'string', enum: ['upcoming', 'past'] },
      limit: { type: 'integer', minimum: 1, maximum: 10 },
    },
    required: ['scope'],
    additionalProperties: false,
  };
  readonly argsDto = MyAppointmentsArgsDto;

  constructor(private readonly appointmentsService: AppointmentsService) {}

  async execute(
    actor: ChatActor,
    args: MyAppointmentsArgsDto,
  ): Promise<unknown> {
    const patientId = patientIdOf(actor);
    if (!patientId) return NO_PROFILE;
    const appointments = await this.appointmentsService.getPatientAppointments(
      patientId,
      args.scope,
      args.limit ?? DEFAULT_APPOINTMENTS,
    );
    return {
      scope: args.scope,
      appointments: appointments.map(appointmentView),
    };
  }
}

@Injectable()
export class GetMyVisitsTool implements ChatTool<MyVisitsArgsDto> {
  readonly name = 'get_my_visits';
  readonly description =
    'Historial de visitas del paciente (la más reciente primero), incluidas las citas a las que no asistió.';
  readonly parameters: JsonSchema = {
    type: 'object',
    properties: { limit: { type: 'integer', minimum: 1, maximum: 20 } },
    additionalProperties: false,
  };
  readonly argsDto = MyVisitsArgsDto;

  constructor(private readonly appointmentsService: AppointmentsService) {}

  async execute(actor: ChatActor, args: MyVisitsArgsDto): Promise<unknown> {
    const patientId = patientIdOf(actor);
    if (!patientId) return NO_PROFILE;
    // Mismo criterio que "Mis citas" (CLI-209/210): citas pasadas, sin las
    // canceladas; las que el doctor marcó "no asistió" van con su estado.
    const visits = await this.appointmentsService.getPatientVisits(patientId);
    return {
      total: visits.length,
      missed: visits.filter((v) => v.status === 'no_show').length,
      visits: visits.slice(0, args.limit ?? DEFAULT_VISITS).map((visit) => ({
        ...appointmentView(visit),
        attended: visit.status !== 'no_show',
      })),
      note: 'attended=false: el paciente no asistió a esa cita.',
    };
  }
}

@Injectable()
export class GetMyQuotesTool implements ChatTool<object> {
  readonly name = 'get_my_quotes';
  readonly description =
    'Presupuestos del paciente (5 más recientes, numerados): total, pagado y saldo; cada tratamiento numerado (line) con pagado, pendiente y si ya se realizó; y los pagos con recibo.';
  // Sin filtro por estado a propósito: en vivo el modelo pedía status=pending
  // para "lo que me presupuestaron" y dejaba afuera los de pago parcial.
  readonly parameters = NO_PARAMETERS;
  readonly argsDto = NO_ARGS;

  constructor(private readonly quotesService: QuotesService) {}

  async execute(actor: ChatActor): Promise<unknown> {
    const patientId = patientIdOf(actor);
    if (!patientId) return NO_PROFILE;
    const all = await this.quotesService.findSharedByPatient(patientId);
    const quotes = all.slice(0, MAX_QUOTES).map((quote, index) => ({
      ...quoteView(quote, index + 1),
      payments: quote.payments.map((p) => ({
        date: clinicDate(p.paymentDate),
        amountBob: round2(p.amount),
        receipt: p.receiptNumber,
      })),
    }));
    return {
      total: all.length,
      quotes,
      note: `${PAYMENT_NOTE} ${NUMBERS_NOTE}`,
    };
  }
}

@Injectable()
export class GetMyBalanceTool implements ChatTool<object> {
  readonly name = 'get_my_balance';
  readonly description =
    'Cuánto debe en total el paciente: suma de los saldos sin pagar, en Bs.';
  readonly parameters = NO_PARAMETERS;
  readonly argsDto = NO_ARGS;

  constructor(private readonly quotesService: QuotesService) {}

  async execute(actor: ChatActor): Promise<unknown> {
    const patientId = patientIdOf(actor);
    if (!patientId) return NO_PROFILE;
    // Quote.balance nunca es negativo: un presupuesto levemente sobrepagado
    // no resta (mismo criterio que el reporte financiero, CLI-65).
    const balances = (await this.quotesService.findSharedByPatient(patientId))
      .map((quote) => quote.balance)
      .filter((balance) => balance > 0);
    return {
      totalBalanceBob: round2(balances.reduce((sum, b) => sum + b, 0)),
      quotesWithBalance: balances.length,
      note: PAYMENT_NOTE,
    };
  }
}

@Injectable()
export class GetMyTreatmentsTool implements ChatTool<MyTreatmentsArgsDto> {
  readonly name = 'get_my_treatments';
  readonly description =
    'Tratamientos ya realizados al paciente, del más reciente al más antiguo: fecha, tratamiento y piezas.';
  readonly parameters: JsonSchema = {
    type: 'object',
    properties: { limit: { type: 'integer', minimum: 1, maximum: 20 } },
    additionalProperties: false,
  };
  readonly argsDto = MyTreatmentsArgsDto;

  constructor(private readonly patientsService: PatientsService) {}

  async execute(actor: ChatActor, args: MyTreatmentsArgsDto): Promise<unknown> {
    const patientId = patientIdOf(actor);
    if (!patientId) return NO_PROFILE;
    const procedures =
      await this.patientsService.findToothProcedures(patientId);
    // Una aplicación en varias piezas son varias filas con el mismo grupo.
    const groups = new Map<
      string,
      { date: string; treatment: string; teeth: number[] }
    >();
    for (const procedure of procedures) {
      const key = procedure.applicationGroupId ?? procedure.id;
      const group = groups.get(key) ?? {
        date: clinicDate(procedure.procedureDate),
        treatment: procedure.treatmentName,
        teeth: [],
      };
      if (procedure.toothNumber !== null) {
        group.teeth.push(procedure.toothNumber);
      }
      groups.set(key, group);
    }
    const treatments = [...groups.values()]
      .slice(0, args.limit ?? DEFAULT_TREATMENTS)
      .map((g) => ({
        date: g.date,
        treatment: g.treatment,
        ...(g.teeth.length > 0 && { teeth: g.teeth }),
      }));
    // total deja decir "te muestro los 10 más recientes de 14" (CLI-145).
    return { total: groups.size, treatments };
  }
}

@Injectable()
export class GetMyPendingTreatmentsTool implements ChatTool<object> {
  readonly name = 'get_my_pending_treatments';
  readonly description =
    'Lo que le falta según sus presupuestos: tratamientos por realizar o con saldo por pagar.';
  readonly parameters = NO_PARAMETERS;
  readonly argsDto = NO_ARGS;

  constructor(private readonly quotesService: QuotesService) {}

  async execute(actor: ChatActor): Promise<unknown> {
    const patientId = patientIdOf(actor);
    if (!patientId) return NO_PROFILE;
    const quotes = await this.quotesService.findSharedByPatient(patientId);
    // Desde CLI-226 cada línea sabe si el doctor ya la realizó, y desde
    // CLI-218 cuánto tiene pagado.
    const treatments = quotes.slice(0, MAX_QUOTES).flatMap((quote, index) =>
      quoteView(quote, index + 1)
        .lines.filter(
          (line) => line.status === 'por realizar' || line.pendingBob > 0,
        )
        .map((line) => ({ quote: index + 1, ...line })),
    );
    return { treatments, note: `${PAYMENT_NOTE} ${NUMBERS_NOTE}` };
  }
}

export const PATIENT_TOOLS = [
  GetMyNextAppointmentTool,
  GetMyAppointmentsTool,
  GetMyVisitsTool,
  GetMyQuotesTool,
  GetMyBalanceTool,
  GetMyTreatmentsTool,
  GetMyPendingTreatmentsTool,
];
