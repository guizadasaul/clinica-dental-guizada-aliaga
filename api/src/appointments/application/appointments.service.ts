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
  SlotUnavailableError,
} from '../domain/AppointmentRepository.js';
import type { IAppointmentRepository } from '../domain/AppointmentRepository.js';
import { buildSlotsForDate, isValidSlot } from '../domain/ClinicSchedule.js';

export interface AvailabilityResult {
  date: string;
  slots: string[];
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
  ) {}

  async getAvailability(date: string): Promise<AvailabilityResult> {
    const allSlots = buildSlotsForDate(date);
    if (allSlots.length === 0) {
      return { date, slots: [] };
    }
    const now = new Date();
    const dayStart = allSlots[0];
    const dayEnd = new Date(
      allSlots[allSlots.length - 1].getTime() + 24 * 60 * 60 * 1000,
    );
    const active = await this.appointmentRepo.findActiveBetween(
      dayStart,
      dayEnd,
      now,
    );
    const takenTimes = new Set(
      active.map((a) => a.appointmentDatetime.getTime()),
    );

    const freeSlots = allSlots.filter(
      (slot) =>
        !takenTimes.has(slot.getTime()) && slot.getTime() > now.getTime(),
    );
    return { date, slots: freeSlots.map((s) => s.toISOString()) };
  }

  async holdSlot(slotIso: string): Promise<HoldResult> {
    const slot = new Date(slotIso);
    if (!isValidSlot(slot) || slot.getTime() <= Date.now()) {
      throw new BadRequestException('El horario solicitado no es válido');
    }

    const holdExpiresAt = new Date(Date.now() + HOLD_TTL_MINUTES * 60 * 1000);
    try {
      const appointment = await this.appointmentRepo.createHold({
        slot,
        holdExpiresAt,
        treatmentId: null,
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
    fullName: string,
    phone: string,
  ): Promise<Appointment> {
    const updated = await this.appointmentRepo.updateGuestContact(
      id,
      { fullName, phone },
      new Date(),
    );
    if (!updated) {
      const existing = await this.appointmentRepo.findById(id);
      if (!existing) {
        throw new NotFoundException('Cita no encontrada');
      }
      throw new GoneException('El horario reservado ya venció');
    }
    return updated;
  }
}
