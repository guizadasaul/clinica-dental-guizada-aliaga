import {
  BadRequestException,
  ConflictException,
  GoneException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Appointment,
  AppointmentSource,
  AppointmentStatus,
  HOLD_TTL_MINUTES,
} from '../domain/Appointment.js';
import {
  AppointmentRepository,
  GuestEmailBelongsToAccountError,
  GuestPhoneBelongsToAccountError,
  GuestPhoneConflictError,
  PatientNotFoundError,
  SlotUnavailableError,
} from '../domain/AppointmentRepository.js';
import type {
  AgendaFilters,
  IAppointmentRepository,
} from '../domain/AppointmentRepository.js';
import type { AppointmentWithPatient } from '../domain/AppointmentWithPatient.js';
import type { PatientAppointment } from '../domain/PatientAppointment.js';
import {
  buildSlotsForDate,
  groupBlocksByWeekday,
  isValidSlot,
  SLOT_MINUTES,
} from '../domain/ClinicSchedule.js';
import type { WeeklySchedule } from '../domain/ClinicSchedule.js';
import { TreatmentRepository } from '../../treatments/domain/TreatmentRepository.js';
import type { ITreatmentRepository } from '../../treatments/domain/TreatmentRepository.js';
import { DoctorRepository } from '../../doctors/domain/DoctorRepository.js';
import type { IDoctorRepository } from '../../doctors/domain/DoctorRepository.js';
import { DoctorScheduleRepository } from '../../doctors/domain/DoctorScheduleRepository.js';
import type {
  DoctorScheduleBlock,
  IDoctorScheduleRepository,
} from '../../doctors/domain/DoctorScheduleRepository.js';

// Bolivia no tiene horario de verano (UTC-4 fijo), así que sumar días de
// calendario en UTC es seguro para generar el rango de fechas a consultar.
function addDaysToDateString(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number);
  const next = new Date(Date.UTC(year, month - 1, day));
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}

// CLI-47: una cita ocupa tantos slots de grilla como haga falta para cubrir
// su duración real, no solo el de su instante de inicio — redondeando hacia
// arriba (un tratamiento de 45 min bloquea 2 slots de 30, no 1.5).
function occupiedSlotTimes(start: Date, durationMinutes: number): number[] {
  const slotsOccupied = Math.max(1, Math.ceil(durationMinutes / SLOT_MINUTES));
  return Array.from(
    { length: slotsOccupied },
    (_, i) => start.getTime() + i * SLOT_MINUTES * 60_000,
  );
}

export interface AvailabilityResult {
  date: string;
  slots: string[];
}

export interface AvailabilityRangeResult {
  from: string;
  days: number;
  slotsByDate: Record<string, string[]>;
}

/** CLI-148: datos de una cita que agenda el doctor (el doctorId viaja aparte, sale del token). */
export interface DoctorAppointmentInput {
  patientId: string;
  appointmentDatetime: string;
  treatmentId?: string;
  durationMinutes?: number;
  notes?: string;
}

/** CLI-149: nuevo horario de una cita confirmada (notas: undefined = no tocarlas). */
export interface RescheduleInput {
  appointmentDatetime: string;
  durationMinutes?: number;
  notes?: string;
}

const SLOT_TAKEN_MESSAGE = 'Ya tenés una cita en ese horario';

// Cuánto hacia atrás buscar citas que todavía podrían estar en curso al
// empezar la nueva. Holgado a propósito: la duración más larga que se
// agenda son 4 h, pero una cita vieja puede tener otra congelada (CLI-47).
const OVERLAP_LOOKBACK_MS = 24 * 60 * 60 * 1000;

export interface HoldResult {
  appointmentId: string;
  slot: string;
  holdExpiresAt: string;
}

@Injectable()
export class AppointmentsService {
  constructor(
    @Inject(AppointmentRepository)
    private readonly appointmentRepo: IAppointmentRepository,
    @Inject(TreatmentRepository)
    private readonly treatmentRepo: ITreatmentRepository,
    @Inject(DoctorRepository)
    private readonly doctorRepo: IDoctorRepository,
    @Inject(DoctorScheduleRepository)
    private readonly doctorScheduleRepo: IDoctorScheduleRepository,
  ) {}

  // CLI-56: valida antes de tocar disponibilidad/agenda — un doctorId que no
  // existe o no es reservable no debe devolver "agenda libre" (bloques vacíos
  // harían que isValidSlot rechace cualquier turno, pero con un 400 genérico en vez de
  // un 404 claro) ni dejar reservar contra un doctor dado de baja.
  private async requireBookableDoctor(doctorId: string): Promise<void> {
    const bookable = await this.doctorRepo.isBookable(doctorId);
    if (!bookable) {
      throw new NotFoundException(
        `Doctor con id ${doctorId} no encontrado o no reservable`,
      );
    }
  }

  private async scheduleFor(doctorId: string): Promise<WeeklySchedule> {
    const blocks = await this.doctorScheduleRepo.findBlocksForDoctor(doctorId);
    return groupBlocksByWeekday(blocks);
  }

  async getAvailability(
    doctorId: string,
    date: string,
  ): Promise<AvailabilityResult> {
    await this.requireBookableDoctor(doctorId);
    const schedule = await this.scheduleFor(doctorId);
    const allSlots = buildSlotsForDate(date, schedule);
    if (allSlots.length === 0) {
      return { date, slots: [] };
    }
    const now = new Date();
    const dayStart = allSlots[0];
    const dayEnd = new Date(allSlots.at(-1)!.getTime() + 24 * 60 * 60 * 1000);
    const active = await this.appointmentRepo.findActiveBetween(
      dayStart,
      dayEnd,
      now,
      doctorId,
    );
    const takenTimes = new Set(
      active.flatMap((a) =>
        occupiedSlotTimes(a.appointmentDatetime, a.durationMinutes),
      ),
    );

    const freeSlots = allSlots.filter(
      (slot) =>
        !takenTimes.has(slot.getTime()) && slot.getTime() > now.getTime(),
    );
    return { date, slots: freeSlots.map((s) => s.toISOString()) };
  }

  async getAvailabilityRange(
    doctorId: string,
    from: string,
    days: number,
  ): Promise<AvailabilityRangeResult> {
    await this.requireBookableDoctor(doctorId);
    const schedule = await this.scheduleFor(doctorId);
    const dates = Array.from({ length: days }, (_, i) =>
      addDaysToDateString(from, i),
    );
    const slotsByDateRaw = new Map<string, Date[]>();
    let rangeStart: Date | null = null;
    let rangeEnd: Date | null = null;

    for (const date of dates) {
      const slots = buildSlotsForDate(date, schedule);
      slotsByDateRaw.set(date, slots);
      if (slots.length === 0) {
        continue;
      }
      if (!rangeStart || slots[0] < rangeStart) {
        rangeStart = slots[0];
      }
      const dayEnd = new Date(slots.at(-1)!.getTime() + 24 * 60 * 60 * 1000);
      if (!rangeEnd || dayEnd > rangeEnd) {
        rangeEnd = dayEnd;
      }
    }

    const now = new Date();
    const active =
      rangeStart && rangeEnd
        ? await this.appointmentRepo.findActiveBetween(
            rangeStart,
            rangeEnd,
            now,
            doctorId,
          )
        : [];
    const takenTimes = new Set(
      active.flatMap((a) =>
        occupiedSlotTimes(a.appointmentDatetime, a.durationMinutes),
      ),
    );

    const slotsByDate: Record<string, string[]> = {};
    for (const date of dates) {
      slotsByDate[date] = (slotsByDateRaw.get(date) ?? [])
        .filter(
          (slot) =>
            !takenTimes.has(slot.getTime()) && slot.getTime() > now.getTime(),
        )
        .map((s) => s.toISOString());
    }

    return { from, days, slotsByDate };
  }

  async holdSlot(
    doctorId: string,
    slotIso: string,
    treatmentId?: string,
  ): Promise<HoldResult> {
    await this.requireBookableDoctor(doctorId);
    const schedule = await this.scheduleFor(doctorId);
    const slot = new Date(slotIso);
    if (!isValidSlot(slot, schedule) || slot.getTime() <= Date.now()) {
      throw new BadRequestException('El horario solicitado no es válido');
    }

    // Congela la duración real del tratamiento en la cita (CLI-47) — si no
    // se especifica ninguno, un slot de grilla es la mejor suposición
    // disponible, igual que el comportamiento de siempre.
    let durationMinutes = SLOT_MINUTES;
    if (treatmentId) {
      const treatment = await this.treatmentRepo.findById(treatmentId);
      if (!treatment) {
        throw new NotFoundException(
          `Tratamiento con id ${treatmentId} no encontrado`,
        );
      }
      durationMinutes = treatment.estimatedMinutes;
    }

    const holdExpiresAt = new Date(Date.now() + HOLD_TTL_MINUTES * 60 * 1000);
    try {
      const appointment = await this.appointmentRepo.createHold({
        doctorId,
        slot,
        holdExpiresAt,
        treatmentId: treatmentId ?? null,
        durationMinutes,
        source: AppointmentSource.PUBLIC_WEB,
      });
      return {
        appointmentId: appointment.id,
        slot: appointment.appointmentDatetime.toISOString(),
        holdExpiresAt: appointment.holdExpiresAt!.toISOString(),
      };
    } catch (error) {
      if (error instanceof SlotUnavailableError) {
        throw new ConflictException('Ese horario ya no está disponible');
      }
      throw error;
    }
  }

  async saveGuestContact(
    id: string,
    firstName: string,
    lastNamePaternal: string,
    lastNameMaternal: string | null,
    phone: string,
    email: string | null,
  ): Promise<Appointment> {
    let updated: Appointment | null;
    try {
      updated = await this.appointmentRepo.updateGuestContact(
        id,
        { firstName, lastNamePaternal, lastNameMaternal, phone, email },
        new Date(),
      );
    } catch (error) {
      if (error instanceof GuestPhoneConflictError) {
        throw new ConflictException(
          'Ya existe una cita activa con este número de teléfono',
        );
      }
      if (error instanceof GuestEmailBelongsToAccountError) {
        throw new ConflictException(
          'Ese email ya pertenece a una cuenta existente. Iniciá sesión para reservar con tu cuenta.',
        );
      }
      if (error instanceof GuestPhoneBelongsToAccountError) {
        throw new ConflictException(
          'Ese número de teléfono ya pertenece a una cuenta existente. Iniciá sesión para reservar con tu cuenta.',
        );
      }
      throw error;
    }
    if (!updated) {
      const existing = await this.appointmentRepo.findById(id);
      if (!existing) {
        throw new NotFoundException('Cita no encontrada');
      }
      throw new GoneException('El horario reservado ya venció');
    }
    return updated;
  }

  /**
   * CLI-148: el doctor agenda una cita (típicamente el control siguiente a
   * un tratamiento) para un paciente con ficha. Nace confirmada y sin pago.
   * A diferencia de holdSlot, NO exige que caiga dentro de su horario de
   * atención (la agenda permite emergencias fuera de horario; el front
   * avisa), pero nunca puede pisar otra cita activa del mismo doctor.
   */
  async createByDoctor(
    doctorId: string,
    input: DoctorAppointmentInput,
  ): Promise<AppointmentWithPatient> {
    const start = new Date(input.appointmentDatetime);
    const now = new Date();
    this.assertBookableStart(start, now);

    let durationMinutes = input.durationMinutes ?? SLOT_MINUTES;
    if (input.treatmentId) {
      const treatment = await this.treatmentRepo.findById(input.treatmentId);
      if (!treatment) {
        throw new NotFoundException(
          `Tratamiento con id ${input.treatmentId} no encontrado`,
        );
      }
      durationMinutes = input.durationMinutes ?? treatment.estimatedMinutes;
    }

    await this.assertNoOverlap(doctorId, start, durationMinutes, now);

    try {
      return await this.appointmentRepo.createByDoctor({
        doctorId,
        patientId: input.patientId,
        treatmentId: input.treatmentId ?? null,
        appointmentDatetime: start,
        durationMinutes,
        notes: input.notes?.trim() || null,
      });
    } catch (error) {
      if (error instanceof PatientNotFoundError) {
        throw new NotFoundException(
          `Paciente con id ${input.patientId} no encontrado`,
        );
      }
      if (error instanceof SlotUnavailableError) {
        throw new ConflictException(SLOT_TAKEN_MESSAGE);
      }
      throw error;
    }
  }

  /**
   * CLI-149: el doctor mueve una cita confirmada propia a otro horario. Mismas
   * reglas que agendar (futuro, grilla, sin pisar otra cita), sin contar la
   * propia cita como choque. Vale también para una consulta reservada por la
   * web: el pago registrado se conserva.
   */
  async rescheduleByDoctor(
    doctorId: string,
    appointmentId: string,
    input: RescheduleInput,
  ): Promise<AppointmentWithPatient> {
    const current = await this.requireOwnAppointment(doctorId, appointmentId);
    if (current.status !== AppointmentStatus.CONFIRMED) {
      throw new ConflictException(
        'Solo se puede reprogramar una cita confirmada',
      );
    }

    const start = new Date(input.appointmentDatetime);
    const now = new Date();
    this.assertBookableStart(start, now);
    const durationMinutes = input.durationMinutes ?? current.durationMinutes;
    await this.assertNoOverlap(
      doctorId,
      start,
      durationMinutes,
      now,
      appointmentId,
    );

    let updated: AppointmentWithPatient | null;
    try {
      updated = await this.appointmentRepo.reschedule(appointmentId, doctorId, {
        appointmentDatetime: start,
        durationMinutes,
        ...(input.notes !== undefined && {
          notes: input.notes.trim() || null,
        }),
      });
    } catch (error) {
      if (error instanceof SlotUnavailableError) {
        throw new ConflictException(SLOT_TAKEN_MESSAGE);
      }
      throw error;
    }
    if (!updated) {
      // Se canceló entre la lectura y el UPDATE.
      throw new ConflictException(
        'Solo se puede reprogramar una cita confirmada',
      );
    }
    return updated;
  }

  /**
   * CLI-149: el doctor cancela una cita confirmada propia — libera el turno.
   * Idempotente: cancelar una ya cancelada la devuelve tal cual. Una consulta
   * web pagada se cancela igual (la clínica no hace devoluciones) y no se
   * toca nada en BANECO.
   */
  async cancelByDoctor(
    doctorId: string,
    appointmentId: string,
    reason?: string,
  ): Promise<AppointmentWithPatient> {
    const current = await this.requireOwnAppointment(doctorId, appointmentId);
    if (current.status === AppointmentStatus.CANCELLED) {
      return current;
    }
    if (current.status !== AppointmentStatus.CONFIRMED) {
      throw new ConflictException('Solo se puede cancelar una cita confirmada');
    }

    const cancelled = await this.appointmentRepo.cancel(
      appointmentId,
      doctorId,
      doctorId,
      reason?.trim() || null,
    );
    if (cancelled) {
      return cancelled;
    }
    // Cambió entre la lectura y el UPDATE: si ya quedó cancelada, es el
    // mismo resultado (idempotente); si no, ya no es cancelable.
    const latest = await this.requireOwnAppointment(doctorId, appointmentId);
    if (latest.status === AppointmentStatus.CANCELLED) {
      return latest;
    }
    throw new ConflictException('Solo se puede cancelar una cita confirmada');
  }

  // Una cita de otro doctor da el mismo 404 que una inexistente: no se
  // filtra qué ids existen en agendas ajenas.
  private async requireOwnAppointment(
    doctorId: string,
    appointmentId: string,
  ): Promise<AppointmentWithPatient> {
    const appointment = await this.appointmentRepo.findForDoctor(
      appointmentId,
      doctorId,
    );
    if (!appointment) {
      throw new NotFoundException('Cita no encontrada');
    }
    return appointment;
  }

  private assertBookableStart(start: Date, now: Date): void {
    if (start.getTime() <= now.getTime()) {
      throw new BadRequestException('La cita tiene que ser en el futuro');
    }
    if (start.getTime() % (SLOT_MINUTES * 60_000) !== 0) {
      throw new BadRequestException(
        `La cita tiene que empezar en un horario de la grilla (cada ${SLOT_MINUTES} min)`,
      );
    }
  }

  // Choque por duración, no solo por hora de inicio: una cita anterior más
  // larga todavía en curso, o una posterior que la nueva alcanza a pisar.
  private async assertNoOverlap(
    doctorId: string,
    start: Date,
    durationMinutes: number,
    now: Date,
    ignoreAppointmentId?: string,
  ): Promise<void> {
    const end = new Date(start.getTime() + durationMinutes * 60_000);
    const active = await this.appointmentRepo.findActiveBetween(
      new Date(start.getTime() - OVERLAP_LOOKBACK_MS),
      end,
      now,
      doctorId,
    );
    const overlaps = active.some(
      (a) =>
        a.id !== ignoreAppointmentId &&
        a.appointmentDatetime.getTime() + a.durationMinutes * 60_000 >
          start.getTime(),
    );
    if (overlaps) {
      throw new ConflictException(SLOT_TAKEN_MESSAGE);
    }
  }

  /** CLI-148: horario de atención del doctor autenticado, para que su agenda marque lo que queda fuera. */
  getDoctorSchedule(doctorId: string): Promise<DoctorScheduleBlock[]> {
    return this.doctorScheduleRepo.findBlocksForDoctor(doctorId);
  }

  getAgenda(filters: AgendaFilters): Promise<AppointmentWithPatient[]> {
    return this.appointmentRepo.findForAgenda(filters);
  }

  /**
   * Citas confirmadas del paciente (CLI-91, chatbot). `upcoming`: desde ahora,
   * la más cercana primero; `past`: hasta ahora, la más reciente primero.
   * El patientId lo resuelve quien llama a partir de la identidad autenticada.
   */
  getPatientAppointments(
    patientId: string,
    scope: 'upcoming' | 'past',
    limit: number,
    now: Date = new Date(),
  ): Promise<PatientAppointment[]> {
    return this.appointmentRepo.findForPatient(
      patientId,
      scope === 'upcoming'
        ? { from: now, order: 'asc', limit }
        : { to: now, order: 'desc', limit },
    );
  }
}
