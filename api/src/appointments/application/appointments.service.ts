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
  HOLD_TTL_MINUTES,
} from '../domain/Appointment.js';
import {
  AppointmentRepository,
  GuestEmailBelongsToAccountError,
  GuestPhoneBelongsToAccountError,
  GuestPhoneConflictError,
  SlotUnavailableError,
} from '../domain/AppointmentRepository.js';
import type {
  AgendaFilters,
  IAppointmentRepository,
} from '../domain/AppointmentRepository.js';
import type { AppointmentWithPatient } from '../domain/AppointmentWithPatient.js';
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
import type { IDoctorScheduleRepository } from '../../doctors/domain/DoctorScheduleRepository.js';

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

  getAgenda(filters: AgendaFilters): Promise<AppointmentWithPatient[]> {
    return this.appointmentRepo.findForAgenda(filters);
  }
}
