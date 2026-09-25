import { Inject, Injectable } from '@nestjs/common';
import type { ChatTool, JsonSchema } from '../../domain/ChatTool.js';
import { AppointmentsService } from '../../../appointments/application/appointments.service.js';
import { TreatmentsService } from '../../../treatments/application/treatments.service.js';
import { DoctorRepository } from '../../../doctors/domain/DoctorRepository.js';
import type { IDoctorRepository } from '../../../doctors/domain/DoctorRepository.js';
import {
  CLINIC_FAQ,
  CLINIC_INFO,
  FAQ_TOPICS,
} from '../knowledge/clinic-info.js';
import { clinicDate, clinicTime, normalizeText } from './clinic-time.js';
import {
  GetAvailableSlotsArgsDto,
  GetBookingLinkArgsDto,
  GetFaqArgsDto,
  ListServicesArgsDto,
  NoArgsDto,
} from './dto/public-tool-args.dto.js';

const NO_PARAMETERS: JsonSchema = {
  type: 'object',
  properties: {},
  additionalProperties: false,
};
const DATE_PATTERN = '^\\d{4}-\\d{2}-\\d{2}$';
const DESCRIPTION_MAX_CHARS = 200;
const FIRST_SLOTS_PER_DAY = 6;
const DEFAULT_SLOT_DAYS = 7;

function truncate(text: string | null, max: number): string | null {
  if (!text) return null;
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

@Injectable()
export class GetClinicInfoTool implements ChatTool<NoArgsDto> {
  readonly name = 'get_clinic_info';
  readonly description =
    'Datos de contacto de la clínica: dirección, horario general de atención, WhatsApp y correo.';
  readonly parameters = NO_PARAMETERS;
  readonly argsDto = NoArgsDto;

  execute(): Promise<unknown> {
    return Promise.resolve(CLINIC_INFO);
  }
}

@Injectable()
export class GetFaqTool implements ChatTool<GetFaqArgsDto> {
  readonly name = 'get_faq';
  readonly description =
    'Preguntas frecuentes de la clínica (reservas, pagos, primera consulta, ubicación). Opcionalmente filtradas por tema.';
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
    'Tratamientos que ofrece la clínica con su categoría, descripción y precio base referencial en bolivianos. Opcionalmente filtra por categoría (ej. "Ortodoncia", "Endodoncia").';
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
export class ListDoctorsTool implements ChatTool<NoArgsDto> {
  readonly name = 'list_doctors';
  readonly description =
    'Doctores de la clínica que atienden con reserva online, con su especialidad. Devuelve el doctorId necesario para consultar disponibilidad.';
  readonly parameters = NO_PARAMETERS;
  readonly argsDto = NoArgsDto;

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
    'Horarios libres reales para reservar, por doctor y por día (hora de Bolivia). Sin doctorId, consulta todos los doctores. Máximo 14 días desde la fecha "from".';
  readonly parameters: JsonSchema = {
    type: 'object',
    properties: {
      doctorId: { type: 'string', format: 'uuid' },
      from: {
        type: 'string',
        pattern: DATE_PATTERN,
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
    'Link a la página de reserva con el doctor y el horario ya elegidos (el pago y la confirmación se hacen ahí). Solo para un horario libre devuelto por get_available_slots.';
  readonly parameters: JsonSchema = {
    type: 'object',
    properties: {
      doctorId: { type: 'string', format: 'uuid' },
      slot: {
        type: 'string',
        description:
          'Inicio del turno en ISO 8601, tal como lo devuelve la disponibilidad.',
      },
    },
    required: ['doctorId', 'slot'],
    additionalProperties: false,
  };
  readonly argsDto = GetBookingLinkArgsDto;

  constructor(private readonly appointmentsService: AppointmentsService) {}

  async execute(
    _actor: unknown,
    args: GetBookingLinkArgsDto,
  ): Promise<unknown> {
    const slot = new Date(args.slot);
    const { slots } = await this.appointmentsService.getAvailability(
      args.doctorId,
      clinicDate(slot),
    );
    // Solo un horario que hoy esté libre en la grilla del doctor. No se crea
    // ningún hold acá: lo crea el flujo de reserva cuando el usuario abre el
    // link, así una charla abandonada no bloquea horarios.
    const slotIso = slot.toISOString();
    if (!slots.includes(slotIso)) {
      return { error: 'slot_unavailable' };
    }
    const url = new URL(
      '/reservar',
      process.env['FRONTEND_URL'] || 'http://localhost:4200',
    );
    url.searchParams.set('slot', slotIso);
    url.searchParams.set('doctorId', args.doctorId);
    return {
      url: url.toString(),
      date: clinicDate(slot),
      time: clinicTime(slot),
    };
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
