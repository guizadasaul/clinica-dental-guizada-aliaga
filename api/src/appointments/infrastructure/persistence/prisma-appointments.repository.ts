import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service.js';
import { Appointment, AppointmentStatus } from '../../domain/Appointment.js';
import {
  CreateHoldData,
  GuestContactData,
  IAppointmentRepository,
  SlotUnavailableError,
} from '../../domain/AppointmentRepository.js';
import { AppointmentMapper } from './appointment.mapper.js';

@Injectable()
export class PrismaAppointmentsRepository implements IAppointmentRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findActiveBetween(
    from: Date,
    to: Date,
    now: Date,
  ): Promise<Appointment[]> {
    const records = await this.prisma.appointments.findMany({
      where: {
        appointment_datetime: { gte: from, lt: to },
        OR: [
          { status: AppointmentStatus.CONFIRMED },
          { status: AppointmentStatus.HELD, hold_expires_at: { gt: now } },
        ],
      },
      orderBy: { appointment_datetime: 'asc' },
    });
    return records.map((record) => AppointmentMapper.toDomain(record));
  }

  async findById(id: string): Promise<Appointment | null> {
    const record = await this.prisma.appointments.findUnique({ where: { id } });
    return record ? AppointmentMapper.toDomain(record) : null;
  }

  async createHold(data: CreateHoldData): Promise<Appointment> {
    try {
      const record = await this.prisma.transaction(async (tx) => {
        // Libera holds vencidos de ese slot puntual — el UPDATE toma row-lock y
        // serializa requests concurrentes sobre el mismo horario.
        await tx.appointments.updateMany({
          where: {
            appointment_datetime: data.slot,
            status: AppointmentStatus.HELD,
            hold_expires_at: { lt: new Date() },
          },
          data: { status: AppointmentStatus.EXPIRED },
        });
        return tx.appointments.create({
          data: {
            appointment_datetime: data.slot,
            status: AppointmentStatus.HELD,
            source: data.source,
            treatment_id: data.treatmentId,
            hold_expires_at: data.holdExpiresAt,
          },
        });
      });
      return AppointmentMapper.toDomain(record);
    } catch (error: unknown) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new SlotUnavailableError();
      }
      throw error;
    }
  }

  async updateGuestContact(
    id: string,
    data: GuestContactData,
    now: Date,
  ): Promise<Appointment | null> {
    const { count } = await this.prisma.appointments.updateMany({
      where: {
        id,
        status: AppointmentStatus.HELD,
        hold_expires_at: { gt: now },
      },
      data: { guest_full_name: data.fullName, guest_phone: data.phone },
    });
    if (count === 0) {
      return null;
    }
    const record = await this.prisma.appointments.findUnique({ where: { id } });
    return record ? AppointmentMapper.toDomain(record) : null;
  }
}
