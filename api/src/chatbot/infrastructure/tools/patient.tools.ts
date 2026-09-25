import { Inject, Injectable } from '@nestjs/common';
import type { ChatActor } from '../../domain/ChatActor.js';
import type { ChatTool, JsonSchema } from '../../domain/ChatTool.js';
import { AppointmentsService } from '../../../appointments/application/appointments.service.js';
import type { PatientAppointment } from '../../../appointments/domain/PatientAppointment.js';
import { QuotesService } from '../../../quotes/application/quotes.service.js';
import type { Quote } from '../../../quotes/domain/Quote.js';
import type { QuoteItem } from '../../../quotes/domain/QuoteItem.js';
import { PatientsService } from '../../../patients/application/patients.service.js';
import { TreatmentRepository } from '../../../treatments/domain/TreatmentRepository.js';
import type { ITreatmentRepository } from '../../../treatments/domain/TreatmentRepository.js';
import { clinicDate, clinicTime } from './clinic-time.js';
import {
  MyAppointmentsArgsDto,
  MyQuotesArgsDto,
  MyTreatmentsArgsDto,
} from './dto/patient-tool-args.dto.js';

/**
 * Tools del paciente (CLI-91): solo su propia información. El patientId sale
 * SIEMPRE de `actor.patientId`, que resolvió el backend a partir del token
 * (users → patients.user_id); ningún DTO acepta un id. Las salidas son
 * mínimas: sin notas, sin historia clínica, sin ids internos.
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

const NO_PROFILE = {
  error: 'no_patient_profile',
  note: 'El usuario todavía no tiene ficha de paciente en la clínica.',
};

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

function balanceOf(quote: Quote): number {
  // Un presupuesto levemente sobrepagado no suma saldo negativo (mismo
  // criterio que el reporte financiero de CLI-65).
  return round2(Math.max(0, quote.totalAmount - quote.totalPaid));
}

function appointmentView(appointment: PatientAppointment) {
  return {
    date: clinicDate(appointment.appointmentDatetime),
    time: clinicTime(appointment.appointmentDatetime),
    doctor: appointment.doctorName,
    treatment: appointment.treatmentName,
    durationMinutes: appointment.durationMinutes,
  };
}

/** Nombres de tratamiento por id, incluidos los que ya no están activos. */
async function treatmentNames(
  repo: ITreatmentRepository,
  ids: string[],
): Promise<Record<string, string>> {
  const unique = [...new Set(ids)];
  const treatments = await Promise.all(unique.map((id) => repo.findById(id)));
  return Object.fromEntries(
    unique.map((id, index) => [id, treatments[index]?.name ?? 'Tratamiento']),
  );
}

/**
 * Agrupa las filas de un presupuesto: una aplicación multiple_teeth son varias
 * filas (una por pieza) que comparten precio de grupo (CLI-45). Se muestra una
 * línea por aplicación, con sus piezas y el subtotal una sola vez.
 */
function groupItems(items: QuoteItem[], names: Record<string, string>) {
  const groups = new Map<
    string,
    { treatment: string; teeth: number[]; subtotalBob: number }
  >();
  for (const item of items) {
    const key = item.applicationGroupId ?? item.id;
    const group = groups.get(key) ?? {
      treatment: names[item.treatmentId],
      teeth: [],
      subtotalBob: round2(item.subtotal),
    };
    if (item.toothNumber !== null) {
      group.teeth.push(item.toothNumber);
    }
    groups.set(key, group);
  }
  return [...groups.values()].map((g) => ({
    treatment: g.treatment,
    ...(g.teeth.length > 0 && { teeth: g.teeth }),
    subtotalBob: g.subtotalBob,
  }));
}

@Injectable()
export class GetMyNextAppointmentTool implements ChatTool<object> {
  readonly name = 'get_my_next_appointment';
  readonly description =
    'Próxima cita confirmada del paciente que está chateando: fecha, hora (Bolivia), doctor y tratamiento.';
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
    'Citas confirmadas del paciente que está chateando: próximas (upcoming) o anteriores (past).';
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
export class GetMyQuotesTool implements ChatTool<MyQuotesArgsDto> {
  readonly name = 'get_my_quotes';
  readonly description =
    'Presupuestos del paciente que está chateando (los 5 más recientes): total, pagado, saldo, tratamientos y pagos con su recibo. Montos en bolivianos.';
  readonly parameters: JsonSchema = {
    type: 'object',
    properties: {
      status: { type: 'string', enum: ['pending', 'partially_paid', 'paid'] },
    },
    additionalProperties: false,
  };
  readonly argsDto = MyQuotesArgsDto;

  constructor(
    private readonly quotesService: QuotesService,
    @Inject(TreatmentRepository)
    private readonly treatmentRepo: ITreatmentRepository,
  ) {}

  async execute(actor: ChatActor, args: MyQuotesArgsDto): Promise<unknown> {
    const patientId = patientIdOf(actor);
    if (!patientId) return NO_PROFILE;
    const quotes = (await this.quotesService.findByPatient(patientId))
      .filter((q) => !args.status || q.status === args.status)
      .slice(0, MAX_QUOTES);
    const names = await treatmentNames(
      this.treatmentRepo,
      quotes.flatMap((q) => q.items.map((i) => i.treatmentId)),
    );
    return quotes.map((quote) => ({
      date: clinicDate(quote.createdAt),
      status: QUOTE_STATUS_LABEL[quote.status] ?? quote.status,
      totalBob: round2(quote.totalAmount),
      paidBob: round2(quote.totalPaid),
      balanceBob: balanceOf(quote),
      items: groupItems(quote.items, names),
      payments: quote.payments.map((p) => ({
        date: clinicDate(p.paymentDate),
        amountBob: round2(p.amount),
        receipt: p.receiptNumber,
      })),
    }));
  }
}

@Injectable()
export class GetMyBalanceTool implements ChatTool<object> {
  readonly name = 'get_my_balance';
  readonly description =
    'Cuánto debe en total el paciente que está chateando: suma de los saldos de sus presupuestos sin pagar, en bolivianos.';
  readonly parameters = NO_PARAMETERS;
  readonly argsDto = NO_ARGS;

  constructor(private readonly quotesService: QuotesService) {}

  async execute(actor: ChatActor): Promise<unknown> {
    const patientId = patientIdOf(actor);
    if (!patientId) return NO_PROFILE;
    const withBalance = (await this.quotesService.findByPatient(patientId))
      .map(balanceOf)
      .filter((balance) => balance > 0);
    return {
      totalBalanceBob: round2(withBalance.reduce((sum, b) => sum + b, 0)),
      quotesWithBalance: withBalance.length,
    };
  }
}

@Injectable()
export class GetMyTreatmentsTool implements ChatTool<MyTreatmentsArgsDto> {
  readonly name = 'get_my_treatments';
  readonly description =
    'Tratamientos ya realizados al paciente que está chateando, del más reciente al más antiguo: fecha, tratamiento y piezas.';
  readonly parameters: JsonSchema = {
    type: 'object',
    properties: { limit: { type: 'integer', minimum: 1, maximum: 20 } },
    additionalProperties: false,
  };
  readonly argsDto = MyTreatmentsArgsDto;

  constructor(
    private readonly patientsService: PatientsService,
    @Inject(TreatmentRepository)
    private readonly treatmentRepo: ITreatmentRepository,
  ) {}

  async execute(actor: ChatActor, args: MyTreatmentsArgsDto): Promise<unknown> {
    const patientId = patientIdOf(actor);
    if (!patientId) return NO_PROFILE;
    const procedures =
      await this.patientsService.findToothProcedures(patientId);
    const names = await treatmentNames(
      this.treatmentRepo,
      procedures.map((p) => p.treatmentId),
    );
    // Una aplicación en varias piezas son varias filas con el mismo grupo.
    const groups = new Map<
      string,
      { date: string; treatment: string; teeth: number[] }
    >();
    for (const procedure of procedures) {
      const key = procedure.applicationGroupId ?? procedure.id;
      const group = groups.get(key) ?? {
        date: clinicDate(procedure.procedureDate),
        treatment: names[procedure.treatmentId],
        teeth: [],
      };
      if (procedure.toothNumber !== null) {
        group.teeth.push(procedure.toothNumber);
      }
      groups.set(key, group);
    }
    return [...groups.values()]
      .slice(0, args.limit ?? DEFAULT_TREATMENTS)
      .map((g) => ({
        date: g.date,
        treatment: g.treatment,
        ...(g.teeth.length > 0 && { teeth: g.teeth }),
      }));
  }
}

@Injectable()
export class GetMyPendingTreatmentsTool implements ChatTool<object> {
  readonly name = 'get_my_pending_treatments';
  readonly description =
    'Tratamientos presupuestados que el paciente que está chateando todavía no terminó de pagar.';
  readonly parameters = NO_PARAMETERS;
  readonly argsDto = NO_ARGS;

  constructor(
    private readonly quotesService: QuotesService,
    @Inject(TreatmentRepository)
    private readonly treatmentRepo: ITreatmentRepository,
  ) {}

  async execute(actor: ChatActor): Promise<unknown> {
    const patientId = patientIdOf(actor);
    if (!patientId) return NO_PROFILE;
    const unpaid = (await this.quotesService.findByPatient(patientId)).filter(
      (q) => q.status !== 'paid',
    );
    const names = await treatmentNames(
      this.treatmentRepo,
      unpaid.flatMap((q) => q.items.map((i) => i.treatmentId)),
    );
    return {
      treatments: unpaid.flatMap((q) => groupItems(q.items, names)),
      // No hay vínculo entre un ítem presupuestado y el procedimiento
      // realizado: "pendiente" se deriva de los presupuestos sin pagar.
      note: 'Según los presupuestos que todavía no están pagados por completo. Para saber cuáles ya se realizaron, consultar al doctor.',
    };
  }
}

export const PATIENT_TOOLS = [
  GetMyNextAppointmentTool,
  GetMyAppointmentsTool,
  GetMyQuotesTool,
  GetMyBalanceTool,
  GetMyTreatmentsTool,
  GetMyPendingTreatmentsTool,
];
