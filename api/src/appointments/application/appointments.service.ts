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
  AttendanceStatus,
  IAppointmentRepository,
} from '../domain/AppointmentRepository.js';
import type { AppointmentWithPatient } from '../domain/AppointmentWithPatient.js';
import type { DoctorTimeBlock } from '../domain/DoctorTimeBlock.js';
import { DoctorTimeBlockRepository } from '../domain/DoctorTimeBlockRepository.js';
import type { IDoctorTimeBlockRepository } from '../domain/DoctorTimeBlockRepository.js';
import type { PatientAppointment } from '../domain/PatientAppointment.js';
import {
  buildSlotsForDate,
  groupBlocksByWeekday,
  CLINIC_TIMEZONE,
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

/** Intervalo [inicio, fin) que ocupa una cita, en milisegundos. */
interface BusyInterval {
  start: number;
  end: number;
}

function busyIntervals(
  active: readonly { appointmentDatetime: Date; durationMinutes: number }[],
): BusyInterval[] {
  return active.map((a) => ({
    start: a.appointmentDatetime.getTime(),
    end:
      a.appointmentDatetime.getTime() + Math.max(1, a.durationMinutes) * 60_000,
  }));
}

/** Los horarios que el doctor reservó (CLI-195) ocupan la agenda igual que una cita. */
function blockIntervals(blocks: readonly DoctorTimeBlock[]): BusyInterval[] {
  return blocks.map((b) => ({
    start: b.startsAt.getTime(),
    end: b.endsAt.getTime(),
  }));
}

// CLI-47, CLI-194: una cita ocupa todos los slots de grilla que su duración
// real toca, no solo el de su instante de inicio. Se compara por intervalos y
// no por franjas enteras: una cita de 45 min bloquea 2 slots de 30, y una de
// 30 min que empieza a las 09:45 (el doctor agenda de a 5 min) bloquea el de
// las 09:30 y el de las 10:00.
function isSlotBusy(slot: Date, intervals: readonly BusyInterval[]): boolean {
  const slotStart = slot.getTime();
  const slotEnd = slotStart + SLOT_MINUTES * 60_000;
  return intervals.some((i) => i.start < slotEnd && slotStart < i.end);
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

const SLOT_TAKEN_MESSAGE = 'Ya tienes una cita en ese horario';
const ATTENDANCE_STATUS_MESSAGE =
  'Solo se puede marcar "No asistió" en una cita confirmada';
const TIME_BLOCKED_MESSAGE =
  'Ese horario lo tienes reservado en tu agenda. Quita la reserva o elige otro horario.';
/** Un bloqueo no puede durar más que esto: evita apartar la agenda "para siempre" por un error de fecha. */
const MAX_TIME_BLOCK_MS = 31 * 24 * 60 * 60 * 1000;

const BLOCK_WHEN_FORMATTER = new Intl.DateTimeFormat('es-BO', {
  timeZone: CLINIC_TIMEZONE,
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

function blockedByLabel(a: {
  appointmentDatetime: Date;
  durationMinutes: number;
}): string {
  const end = new Date(
    a.appointmentDatetime.getTime() + a.durationMinutes * 60_000,
  );
  return `${BLOCK_WHEN_FORMATTER.format(a.appointmentDatetime)} a ${BLOCK_WHEN_FORMATTER.format(end).split(', ').pop()}`;
}

// Cuánto hacia atrás buscar citas que todavía podrían estar en curso al
// empezar la nueva. Holgado a propósito: la duración más larga que se
// agenda son 4 h, pero una cita vieja puede tener otra congelada (CLI-47).
const OVERLAP_LOOKBACK_MS = 24 * 60 * 60 * 1000;
/** Paso de la hora de inicio de las citas que agenda el doctor (CLI-194). */
export const DOCTOR_START_STEP_MINUTES = 5;

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
    @Inject(DoctorTimeBlockRepository)
    private readonly timeBlockRepo: IDoctorTimeBlockRepository,
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
    const blocks = await this.timeBlockRepo.findOverlapping(
      doctorId,
      dayStart,
      dayEnd,
    );
    const busy = [...busyIntervals(active), ...blockIntervals(blocks)];

    const freeSlots = allSlots.filter(
      (slot) => !isSlotBusy(slot, busy) && slot.getTime() > now.getTime(),
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
    const blocks =
      rangeStart && rangeEnd
        ? await this.timeBlockRepo.findOverlapping(
            doctorId,
            rangeStart,
            rangeEnd,
          )
        : [];
    const busy = [...busyIntervals(active), ...blockIntervals(blocks)];

    const slotsByDate: Record<string, string[]> = {};
    for (const date of dates) {
      slotsByDate[date] = (slotsByDateRaw.get(date) ?? [])
        .filter(
          (slot) => !isSlotBusy(slot, busy) && slot.getTime() > now.getTime(),
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

    // Una cita del doctor que no empieza en la grilla (CLI-194) o más larga que
    // una franja puede tapar este slot sin tener su mismo instante de inicio,
    // y el índice único solo mira el instante exacto: se revisa por duración.
    if (
      (await this.overlapReason(
        doctorId,
        slot,
        durationMinutes,
        new Date(),
      )) !== null
    ) {
      throw new ConflictException('Ese horario ya no está disponible');
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
          'Ese email ya pertenece a una cuenta existente. Inicia sesión para reservar con tu cuenta.',
        );
      }
      if (error instanceof GuestPhoneBelongsToAccountError) {
        throw new ConflictException(
          'Ese número de teléfono ya pertenece a una cuenta existente. Inicia sesión para reservar con tu cuenta.',
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

  /**
   * CLI-208: el doctor marca que el paciente no vino a una cita confirmada
   * propia que ya pasó. Deja de contar como visita en el panel del paciente.
   * Idempotente: marcar una que ya está como "No asistió" la devuelve tal cual.
   */
  markNoShow(
    doctorId: string,
    appointmentId: string,
    now: Date = new Date(),
  ): Promise<AppointmentWithPatient> {
    return this.changeAttendance(
      doctorId,
      appointmentId,
      AppointmentStatus.CONFIRMED,
      AppointmentStatus.NO_SHOW,
      now,
    );
  }

  /** CLI-208: deshace "No asistió" — la cita vuelve a confirmada. */
  undoNoShow(
    doctorId: string,
    appointmentId: string,
    now: Date = new Date(),
  ): Promise<AppointmentWithPatient> {
    return this.changeAttendance(
      doctorId,
      appointmentId,
      AppointmentStatus.NO_SHOW,
      AppointmentStatus.CONFIRMED,
      now,
    );
  }

  private async changeAttendance(
    doctorId: string,
    appointmentId: string,
    from: AttendanceStatus,
    to: AttendanceStatus,
    now: Date,
  ): Promise<AppointmentWithPatient> {
    const current = await this.requireOwnAppointment(doctorId, appointmentId);
    if (current.status === to) {
      return current;
    }
    if (current.status !== from) {
      throw new ConflictException(ATTENDANCE_STATUS_MESSAGE);
    }
    if (current.appointmentDatetime.getTime() > now.getTime()) {
      throw new ConflictException(
        'Solo se puede marcar la asistencia de una cita que ya pasó',
      );
    }

    let updated: AppointmentWithPatient | null;
    try {
      updated = await this.appointmentRepo.setAttendance(
        appointmentId,
        doctorId,
        from,
        to,
      );
    } catch (error) {
      if (error instanceof SlotUnavailableError) {
        throw new ConflictException(
          'No se puede deshacer: ya hay otra cita activa que choca con esta',
        );
      }
      throw error;
    }
    if (updated) {
      return updated;
    }
    // Cambió entre la lectura y el UPDATE: si ya quedó como se pedía, es el
    // mismo resultado (idempotente).
    const latest = await this.requireOwnAppointment(doctorId, appointmentId);
    if (latest.status === to) {
      return latest;
    }
    throw new ConflictException(ATTENDANCE_STATUS_MESSAGE);
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
    // El doctor agenda de a 5 minutos (CLI-194); la reserva pública sigue en
    // la grilla de 30 (holdSlot / isValidSlot).
    if (start.getTime() % (DOCTOR_START_STEP_MINUTES * 60_000) !== 0) {
      throw new BadRequestException(
        `La cita tiene que empezar en un horario múltiplo de ${DOCTOR_START_STEP_MINUTES} minutos`,
      );
    }
  }

  // Choque por duración, no solo por hora de inicio: una cita anterior más
  // larga todavía en curso, o una posterior que la nueva alcanza a pisar. Y
  // un horario que el doctor reservó (CLI-195).
  private async overlapReason(
    doctorId: string,
    start: Date,
    durationMinutes: number,
    now: Date,
    ignoreAppointmentId?: string,
  ): Promise<'appointment' | 'block' | null> {
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
      return 'appointment';
    }
    const blocks = await this.timeBlockRepo.findOverlapping(
      doctorId,
      start,
      end,
    );
    return blocks.length > 0 ? 'block' : null;
  }

  private async assertNoOverlap(
    doctorId: string,
    start: Date,
    durationMinutes: number,
    now: Date,
    ignoreAppointmentId?: string,
  ): Promise<void> {
    const reason = await this.overlapReason(
      doctorId,
      start,
      durationMinutes,
      now,
      ignoreAppointmentId,
    );
    if (reason === 'appointment') {
      throw new ConflictException(SLOT_TAKEN_MESSAGE);
    }
    if (reason === 'block') {
      throw new ConflictException(TIME_BLOCKED_MESSAGE);
    }
  }

  /**
   * CLI-195: el doctor aparta un horario de su agenda. Mismas reglas de hora
   * que sus citas (de 5 en 5); no se puede apartar encima de citas que ya
   * tiene — se rechaza diciendo cuáles, para que las mueva o cancele antes.
   */
  async createTimeBlock(
    doctorId: string,
    input: { startsAt: string; endsAt: string; reason?: string },
  ): Promise<DoctorTimeBlock> {
    const startsAt = new Date(input.startsAt);
    const endsAt = new Date(input.endsAt);
    const now = new Date();
    const stepMs = DOCTOR_START_STEP_MINUTES * 60_000;
    if (startsAt.getTime() % stepMs !== 0 || endsAt.getTime() % stepMs !== 0) {
      throw new BadRequestException(
        `El horario tiene que empezar y terminar en un múltiplo de ${DOCTOR_START_STEP_MINUTES} minutos`,
      );
    }
    if (endsAt.getTime() <= startsAt.getTime()) {
      throw new BadRequestException(
        'La hora de fin tiene que ser posterior a la de inicio',
      );
    }
    if (endsAt.getTime() <= now.getTime()) {
      throw new BadRequestException(
        'El horario reservado tiene que ser futuro',
      );
    }
    if (endsAt.getTime() - startsAt.getTime() > MAX_TIME_BLOCK_MS) {
      throw new BadRequestException(
        'Un horario reservado no puede durar más de 31 días',
      );
    }

    const active = await this.appointmentRepo.findActiveBetween(
      new Date(startsAt.getTime() - OVERLAP_LOOKBACK_MS),
      endsAt,
      now,
      doctorId,
    );
    const clashes = active
      .filter(
        (a) =>
          a.appointmentDatetime.getTime() < endsAt.getTime() &&
          a.appointmentDatetime.getTime() + a.durationMinutes * 60_000 >
            startsAt.getTime(),
      )
      .sort(
        (a, b) =>
          a.appointmentDatetime.getTime() - b.appointmentDatetime.getTime(),
      );
    if (clashes.length > 0) {
      const list = clashes.map(blockedByLabel).join('; ');
      const count = clashes.length === 1 ? '1 cita' : `${clashes.length} citas`;
      throw new ConflictException(
        `No se puede reservar ese horario: ya tienes ${count} (${list}). Muévelas o cancélalas antes.`,
      );
    }

    return this.timeBlockRepo.create({
      doctorId,
      startsAt,
      endsAt,
      reason: input.reason?.trim() || null,
    });
  }

  /** CLI-195: los horarios reservados del doctor que tocan [from, to). */
  listTimeBlocks(
    doctorId: string,
    from: Date,
    to: Date,
  ): Promise<DoctorTimeBlock[]> {
    return this.timeBlockRepo.findOverlapping(doctorId, from, to);
  }

  /** CLI-195: quita un horario reservado propio; uno de otro doctor da 404, igual que uno inexistente. */
  async deleteTimeBlock(doctorId: string, id: string): Promise<void> {
    const deleted = await this.timeBlockRepo.deleteOwn(id, doctorId);
    if (!deleted) {
      throw new NotFoundException('Horario reservado no encontrado');
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

  /**
   * CLI-209: registro de visitas del paciente — todas sus citas pasadas, la
   * más reciente primero, incluidas las que el doctor marcó "No asistió".
   */
  getPatientVisits(
    patientId: string,
    now: Date = new Date(),
  ): Promise<PatientAppointment[]> {
    return this.appointmentRepo.findForPatient(patientId, {
      to: now,
      order: 'desc',
      includeNoShow: true,
    });
  }
}
