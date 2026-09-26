import { Inject, Injectable } from '@nestjs/common';
import type { ChatTool, JsonSchema } from '../../domain/ChatTool.js';
import { ToolOutputWithLinks } from '../../domain/ChatLink.js';
import { AppointmentsService } from '../../../appointments/application/appointments.service.js';
import { TreatmentsService } from '../../../treatments/application/treatments.service.js';
import { DoctorRepository } from '../../../doctors/domain/DoctorRepository.js';
import type { IDoctorRepository } from '../../../doctors/domain/DoctorRepository.js';
import {
  CLINIC_FAQ,
  CLINIC_INFO,
  FAQ_TOPICS,
} from '../knowledge/clinic-info.js';
import { CLINIC_UTC_OFFSET } from '../../../appointments/domain/ClinicSchedule.js';
import { clinicDate, clinicTime, normalizeText } from './clinic-time.js';
import {
  GetAvailableSlotsArgsDto,
  GetBookingLinkArgsDto,
  GetFaqArgsDto,
  ListServicesArgsDto,
} from './dto/public-tool-args.dto.js';

const NO_PARAMETERS: JsonSchema = {
  type: 'object',
  properties: {},
  additionalProperties: false,
};
/**
 * DTO de las tools sin argumentos: Object no tiene propiedades declaradas, así
 * que el validador (forbidNonWhitelisted) rechaza cualquier campo que llegue.
 */
const NO_ARGS = Object;
const DESCRIPTION_MAX_CHARS = 200;
const FIRST_SLOTS_PER_DAY = 6;
const DEFAULT_SLOT_DAYS = 7;

/** "2026-09-26" → "26/09". */
function ddmm(date: string): string {
  const [, month, day] = date.split('-');
  return `${day}/${month}`;
}

function truncate(text: string | null, max: number): string | null {
  if (!text) return null;
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

@Injectable()
export class GetClinicInfoTool implements ChatTool<object> {
  readonly name = 'get_clinic_info';
  readonly description =
    'Dirección, horario general, WhatsApp y correo de la clínica.';
  readonly parameters = NO_PARAMETERS;
  readonly argsDto = NO_ARGS;

  execute(): Promise<unknown> {
    return Promise.resolve(CLINIC_INFO);
  }
}

@Injectable()
export class GetFaqTool implements ChatTool<GetFaqArgsDto> {
  readonly name = 'get_faq';
  readonly description =
    'Preguntas frecuentes: reservas, pagos y seguros, primera consulta, ubicación, niños, contacto y urgencias. Tema opcional.';
  readonly parameters: JsonSchema = {
    type: 'object',
    properties: { topic: { type: 'string', enum: [...FAQ_TOPICS] } },
    additionalProperties: false,
  };
  readonly argsDto = GetFaqArgsDto;

  execute(_actor: unknown, args: GetFaqArgsDto): Promise<unknown> {
    const entries = args.topic
      ? CLINIC_FAQ.filter((entry) => entry.topic === args.topic)
      : CLINIC_FAQ;
    return Promise.resolve(
      entries.map(({ question, answer }) => ({ question, answer })),
    );
  }
}

@Injectable()
export class ListServicesTool implements ChatTool<ListServicesArgsDto> {
  readonly name = 'list_services';
  readonly description =
    'Tratamientos de la clínica con categoría, descripción y precio base en Bs. Categoría opcional (ej. "Ortodoncia").';
  readonly parameters: JsonSchema = {
    type: 'object',
    properties: { category: { type: 'string', maxLength: 50 } },
    additionalProperties: false,
  };
  readonly argsDto = ListServicesArgsDto;

  constructor(private readonly treatmentsService: TreatmentsService) {}

  async execute(_actor: unknown, args: ListServicesArgsDto): Promise<unknown> {
    const treatments = await this.treatmentsService.findActive();
    const wanted = args.category ? normalizeText(args.category) : null;
    const services = treatments
      .filter((t) => !wanted || normalizeText(t.categoryName).includes(wanted))
      .map((t) => ({
        name: t.name,
        category: t.categoryName,
        description: truncate(t.description, DESCRIPTION_MAX_CHARS),
        // basePriceBob solo viene para tratamientos en USD (ya convertido);
        // null si no hay tipo de cambio disponible.
        priceBob: t.currency === 'BOB' ? t.basePrice : t.basePriceBob,
        ...(t.currency !== 'BOB' && {
          originalPrice: t.basePrice,
          originalCurrency: t.currency,
        }),
      }));
    return {
      services,
      note: 'Precios base referenciales. El costo final se define en el presupuesto después de la evaluación.',
    };
  }
}

@Injectable()
export class ListDoctorsTool implements ChatTool<object> {
  readonly name = 'list_doctors';
  readonly description =
    'Doctores con reserva online y su especialidad. El doctorId es interno: úsalo para consultar disponibilidad, nunca lo muestres.';
  readonly parameters = NO_PARAMETERS;
  readonly argsDto = NO_ARGS;

  constructor(
    @Inject(DoctorRepository) private readonly doctorRepo: IDoctorRepository,
  ) {}

  async execute(): Promise<unknown> {
    const doctors = await this.doctorRepo.findBookable();
    return doctors.map((d) => ({
      doctorId: d.id,
      name: d.displayName,
      specialty: d.specialty,
    }));
  }
}

@Injectable()
export class GetAvailableSlotsTool implements ChatTool<GetAvailableSlotsArgsDto> {
  readonly name = 'get_available_slots';
  readonly description =
    'Horarios libres para reservar, por doctor y día (hora de Bolivia). Sin doctorId: todos los doctores. Hasta 14 días desde from.';
  readonly parameters: JsonSchema = {
    type: 'object',
    properties: {
      doctorId: { type: 'string', format: 'uuid' },
      from: {
        type: 'string',
        description: 'YYYY-MM-DD',
      },
      days: { type: 'integer', minimum: 1, maximum: 14 },
    },
    required: ['from'],
    additionalProperties: false,
  };
  readonly argsDto = GetAvailableSlotsArgsDto;

  constructor(
    private readonly appointmentsService: AppointmentsService,
    @Inject(DoctorRepository) private readonly doctorRepo: IDoctorRepository,
  ) {}

  async execute(
    _actor: unknown,
    args: GetAvailableSlotsArgsDto,
  ): Promise<unknown> {
    if (args.from < clinicDate(new Date())) {
      return { error: 'date_in_past' };
    }
    const days = args.days ?? DEFAULT_SLOT_DAYS;
    const doctors = await this.doctorRepo.findBookable();
    const selected = args.doctorId
      ? doctors.filter((d) => d.id === args.doctorId)
      : doctors;
    if (selected.length === 0) {
      return { error: 'doctor_not_found' };
    }

    return Promise.all(
      selected.map(async (doctor) => {
        const range = await this.appointmentsService.getAvailabilityRange(
          doctor.id,
          args.from,
          days,
        );
        return {
          doctorId: doctor.id,
          doctorName: doctor.displayName,
          days: Object.entries(range.slotsByDate)
            .filter(([, slots]) => slots.length > 0)
            .map(([date, slots]) => ({
              date,
              available: slots.length,
              firstTimes: slots
                .slice(0, FIRST_SLOTS_PER_DAY)
                .map((slot) => clinicTime(new Date(slot))),
            })),
        };
      }),
    );
  }
}

@Injectable()
export class GetBookingLinkTool implements ChatTool<GetBookingLinkArgsDto> {
  readonly name = 'get_booking_link';
  readonly description =
    'Link de reserva con el doctor y el horario elegidos (ahí se paga y se confirma). Usa fecha y hora tal como las da get_available_slots. El sistema agrega el link debajo de tu respuesta.';
  readonly parameters: JsonSchema = {
    type: 'object',
    properties: {
      doctorId: { type: 'string', format: 'uuid' },
      date: {
        type: 'string',
        description: 'YYYY-MM-DD',
      },
      time: {
        type: 'string',
        description: 'HH:mm, hora de Bolivia',
      },
    },
    required: ['doctorId', 'date', 'time'],
    additionalProperties: false,
  };
  readonly argsDto = GetBookingLinkArgsDto;

  constructor(private readonly appointmentsService: AppointmentsService) {}

  async execute(
    _actor: unknown,
    args: GetBookingLinkArgsDto,
  ): Promise<unknown> {
    // La conversión a instante la hace el backend, con el offset fijo de la
    // clínica (Bolivia no tiene horario de verano).
    const slotIso = new Date(
      `${args.date}T${args.time}:00${CLINIC_UTC_OFFSET}`,
    ).toISOString();
    const { slots } = await this.appointmentsService.getAvailability(
      args.doctorId,
      args.date,
    );
    // Solo un horario que hoy esté libre en la grilla del doctor. No se crea
    // ningún hold acá: lo crea el flujo de reserva cuando el usuario abre el
    // link, así una charla abandonada no bloquea horarios.
    if (!slots.includes(slotIso)) {
      return { error: 'slot_unavailable' };
    }
    const url = new URL(
      '/reservar',
      process.env['FRONTEND_URL'] || 'http://localhost:4200',
    );
    url.searchParams.set('slot', slotIso);
    url.searchParams.set('doctorId', args.doctorId);
    // La URL no pasa por el modelo (podría recortarla): va como link aparte
    // y el backend la agrega debajo de la respuesta.
    return new ToolOutputWithLinks(
      {
        date: args.date,
        time: args.time,
        linkNote:
          'El link de reserva se agrega solo debajo de tu respuesta: no escribas ninguna URL. La cita todavía NO está reservada: queda reservada recién cuando el usuario complete sus datos y el pago por QR en ese link.',
      },
      [
        {
          // El texto del botón lo pone el backend: deja claro que falta pagar
          // aunque el modelo diga otra cosa.
          label: `Completar reserva y pago (${ddmm(args.date)}, ${args.time})`,
          url: url.toString(),
        },
      ],
    );
  }
}

export const PUBLIC_TOOLS = [
  GetClinicInfoTool,
  GetFaqTool,
  ListServicesTool,
  ListDoctorsTool,
  GetAvailableSlotsTool,
  GetBookingLinkTool,
];
