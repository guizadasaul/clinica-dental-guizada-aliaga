import { Injectable } from '@nestjs/common';
import type { ChatActor } from '../../domain/ChatActor.js';
import type { ChatTool, JsonSchema } from '../../domain/ChatTool.js';
import { AppointmentsService } from '../../../appointments/application/appointments.service.js';
import type { PatientAppointment } from '../../../appointments/domain/PatientAppointment.js';
import { QuotesService } from '../../../quotes/application/quotes.service.js';
import type { Quote } from '../../../quotes/domain/Quote.js';
import type { QuoteLine } from '../../../quotes/domain/QuoteBalance.js';
import { PatientsService } from '../../../patients/application/patients.service.js';
import { FinancesService } from '../../../finances/application/finances.service.js';
import type { QrChargeView } from '../../../finances/application/finances.service.js';
import { QrChargeStatus } from '../../../quotes/domain/QrCharge.js';
import { ToolOutputWithLinks } from '../../domain/ChatLink.js';
import type { QrPaymentAttachment } from '../../domain/ChatAttachment.js';
import { clinicDate, clinicTime, clinicWeekday } from './clinic-time.js';
import {
  CreateMyQrPaymentArgsDto,
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

// Desde CLI-236 el paciente paga con un QR BANECO que genera el propio chat.
// El modelo no cobra ni toma datos de pago: solo genera el QR si lo pide.
const PAYMENT_NOTE =
  'Para pagar, si el paciente lo pide: create_my_qr_payment (QR BANECO aquí mismo). También puede pagar en la clínica (efectivo, QR o transferencia).';
/** El QR lo anula solo el conciliador a los 30 minutos (CLI-220). */
const QR_EXPIRES_MINUTES = 30;
/** Generar, verificar o anular llama a BANECO: más lento que una consulta. */
const QR_TIMEOUT_MS = 20_000;
const QR_NOTE =
  'El QR aparece debajo de tu respuesta: no lo describas ni des ids. Di el monto y qué cubre, que vence en 30 minutos y que, cuando pague, presione "Ya pagué" o te lo diga aquí.';
const NO_PENDING_QR = {
  noPendingQr: true,
  note: 'No hay un QR pendiente. Si ya pagó, el pago quedó registrado: dile su saldo actual con get_my_balance.',
};

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

function qrAttachment(
  view: QrChargeView,
  quote: Quote | undefined,
): QrPaymentAttachment {
  return {
    type: 'qr_payment',
    chargeId: view.chargeId,
    amountBob: round2(view.amount),
    imageBase64: view.qrImageBase64,
    lines: view.lines.map((allocation) => ({
      treatment:
        quote?.lines.find((l) => l.key === allocation.lineKey)?.treatmentName ??
        'Tratamiento',
      amountBob: round2(allocation.amount),
    })),
  };
}

/** Lo que ve el modelo (monto y qué cubre) y, aparte, la tarjeta con el QR. */
function qrOutput(
  view: QrChargeView,
  quote: Quote | undefined,
  alreadyPending: boolean,
): ToolOutputWithLinks {
  const attachment = qrAttachment(view, quote);
  return new ToolOutputWithLinks(
    {
      amountBob: attachment.amountBob,
      lines: attachment.lines,
      expiresInMinutes: QR_EXPIRES_MINUTES,
      ...(alreadyPending && {
        alreadyPending: true,
        pendingNote:
          'Ya tenía este QR pendiente: es el mismo. Para pagar otra cosa, primero tiene que pagarlo o anularlo.',
      }),
      note: QR_NOTE,
    },
    [],
    [attachment],
  );
}

@Injectable()
export class CreateMyQrPaymentTool implements ChatTool<CreateMyQrPaymentArgsDto> {
  readonly name = 'create_my_qr_payment';
  readonly description =
    'QR BANECO para pagar, solo si el paciente pide pagar. Sin lines: todo lo pendiente; lines: números de línea de get_my_quotes. Si ya hay uno pendiente, devuelve ese.';
  readonly parameters: JsonSchema = {
    type: 'object',
    properties: {
      quote: { type: 'integer', minimum: 1, maximum: MAX_QUOTES },
      lines: {
        type: 'array',
        items: { type: 'integer', minimum: 1 },
        minItems: 1,
        maxItems: 50,
      },
    },
    additionalProperties: false,
  };
  readonly argsDto = CreateMyQrPaymentArgsDto;
  readonly timeoutMs = QR_TIMEOUT_MS;

  constructor(
    private readonly quotesService: QuotesService,
    private readonly financesService: FinancesService,
  ) {}

  async execute(
    actor: ChatActor,
    args: CreateMyQrPaymentArgsDto,
  ): Promise<unknown> {
    const patientId = patientIdOf(actor);
    if (!patientId) return NO_PROFILE;
    const [quotes, pending] = await Promise.all([
      this.quotesService.findSharedByPatient(patientId),
      this.financesService.getPendingPatientQrCharge(patientId),
    ]);
    // Un QR pendiente a la vez (CLI-218): se muestra el mismo en vez de fallar.
    if (pending) {
      return qrOutput(
        pending,
        quotes.find((q) => q.id === pending.quoteId),
        true,
      );
    }

    const quote = args.quote
      ? quotes.slice(0, MAX_QUOTES)[args.quote - 1]
      : quotes.find((q) => q.balance > 0);
    if (!quote || quote.balance <= 0) {
      return {
        error: 'no_balance',
        note: 'Ese presupuesto no tiene saldo pendiente: no hay nada que pagar.',
      };
    }
    const numbers = args.lines ?? [];
    const selected =
      numbers.length > 0
        ? numbers.map((n) => ({ number: n, line: quote.lines[n - 1] }))
        : quote.lines
            .map((line, index) => ({ number: index + 1, line }))
            .filter(({ line }) => line.pending > 0);
    const missing = selected.filter(({ line }) => !line).map((s) => s.number);
    if (missing.length > 0) {
      return {
        error: 'invalid_line',
        lines: missing,
        note: 'Esos números de línea no existen en el presupuesto (ver get_my_quotes).',
      };
    }
    const paid = selected
      .filter(({ line }) => line.pending <= 0)
      .map((s) => s.number);
    if (paid.length > 0) {
      return {
        error: 'line_already_paid',
        lines: paid,
        note: 'Esas líneas ya están pagadas.',
      };
    }

    const view = await this.financesService.createPatientQrCharge(
      patientId,
      quote.id,
      selected.map(({ line }) => line.key),
    );
    return qrOutput(view, quote, false);
  }
}

@Injectable()
export class CheckMyQrPaymentTool implements ChatTool<object> {
  readonly name = 'check_my_qr_payment';
  readonly description =
    'Verifica con el banco si ya pagó su QR pendiente ("ya pagué").';
  readonly parameters = NO_PARAMETERS;
  readonly argsDto = NO_ARGS;
  readonly timeoutMs = QR_TIMEOUT_MS;

  constructor(private readonly financesService: FinancesService) {}

  async execute(actor: ChatActor): Promise<unknown> {
    const patientId = patientIdOf(actor);
    if (!patientId) return NO_PROFILE;
    const pending =
      await this.financesService.getPendingPatientQrCharge(patientId);
    if (!pending) return NO_PENDING_QR;
    const result = await this.financesService.verifyPatientQrCharge(
      patientId,
      pending.chargeId,
    );
    if (result.status === QrChargeStatus.PAID) {
      return {
        status: 'paid',
        amountBob: round2(pending.amount),
        balanceBob: round2(result.quote.balance),
        note: 'Pago confirmado y registrado.',
      };
    }
    if (result.status === QrChargeStatus.PENDING) {
      return {
        status: 'pending',
        amountBob: round2(pending.amount),
        note: 'El banco todavía no lo acredita: que espere unos minutos y vuelva a avisar.',
      };
    }
    return {
      status: 'cancelled',
      note: 'El QR venció o se anuló sin pago; si quiere, puede generar otro.',
    };
  }
}

@Injectable()
export class CancelMyQrPaymentTool implements ChatTool<object> {
  readonly name = 'cancel_my_qr_payment';
  readonly description =
    'Anula su QR pendiente (si ya estaba pagado, se registra el pago).';
  readonly parameters = NO_PARAMETERS;
  readonly argsDto = NO_ARGS;
  readonly timeoutMs = QR_TIMEOUT_MS;

  constructor(private readonly financesService: FinancesService) {}

  async execute(actor: ChatActor): Promise<unknown> {
    const patientId = patientIdOf(actor);
    if (!patientId) return NO_PROFILE;
    const pending =
      await this.financesService.getPendingPatientQrCharge(patientId);
    if (!pending) return NO_PENDING_QR;
    // CLI-220: anular nunca pierde un pago; si BANECO dice que ya se pagó,
    // se registra en vez de anularse.
    const result = await this.financesService.cancelPatientQrCharge(
      patientId,
      pending.chargeId,
    );
    return result.status === QrChargeStatus.PAID
      ? {
          status: 'paid',
          balanceBob: round2(result.quote.balance),
          note: 'No se anuló porque ya estaba pagado: el pago quedó registrado.',
        }
      : { status: 'cancelled', note: 'QR anulado.' };
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
  CreateMyQrPaymentTool,
  CheckMyQrPaymentTool,
  CancelMyQrPaymentTool,
];
