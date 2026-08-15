import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service.js';
import { Appointment, AppointmentStatus } from '../../domain/Appointment.js';
import {
  AgendaFilters,
  AttachQrData,
  CreateHoldData,
  GuestContactData,
  IAppointmentRepository,
  SlotUnavailableError,
} from '../../domain/AppointmentRepository.js';
import type { AppointmentWithPatient } from '../../domain/AppointmentWithPatient.js';
import { AppointmentMapper } from './appointment.mapper.js';

@Injectable()
export class PrismaAppointmentsRepository implements IAppointmentRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findForAgenda(
    filters: AgendaFilters,
  ): Promise<AppointmentWithPatient[]> {
    const dateFilter =
      filters.from || filters.to
        ? {
            appointment_datetime: {
              ...(filters.from && { gte: filters.from }),
              ...(filters.to && { lt: filters.to }),
            },
          }
        : {};
    const records = await this.prisma.appointments.findMany({
      where: {
        ...(filters.status && { status: filters.status }),
        ...dateFilter,
      },
      include: { patients: { include: { users: true } } },
      orderBy: { appointment_datetime: 'asc' },
    });
    return records.map((record) =>
      AppointmentMapper.toDomainWithPatient(record),
    );
  }

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

  async findByQrId(qrId: string): Promise<Appointment | null> {
    const record = await this.prisma.appointments.findUnique({
      where: { baneco_qr_id: qrId },
    });
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
      data: {
        guest_full_name: data.fullName,
        guest_phone: data.phone,
        guest_email: data.email,
      },
    });
    if (count === 0) {
      return null;
    }
    const record = await this.prisma.appointments.findUnique({ where: { id } });
    return record ? AppointmentMapper.toDomain(record) : null;
  }

  async attachQr(id: string, data: AttachQrData): Promise<Appointment | null> {
    const { count } = await this.prisma.appointments.updateMany({
      where: { id, status: AppointmentStatus.HELD },
      data: {
        baneco_qr_id: data.qrId,
        baneco_qr_image: data.qrImage,
        payment_amount: data.amount,
      },
    });
    if (count === 0) {
      return null;
    }
    const record = await this.prisma.appointments.findUnique({ where: { id } });
    return record ? AppointmentMapper.toDomain(record) : null;
  }

  async appendNote(id: string, note: string): Promise<void> {
    await this.prisma.appointments.update({
      where: { id },
      data: { notes: note },
    });
  }

  async findHeldWithQr(): Promise<Appointment[]> {
    const records = await this.prisma.appointments.findMany({
      where: {
        status: AppointmentStatus.HELD,
        baneco_qr_id: { not: null },
      },
    });
    return records.map((record) => AppointmentMapper.toDomain(record));
  }

  async markExpired(id: string): Promise<void> {
    await this.prisma.appointments.updateMany({
      where: { id, status: AppointmentStatus.HELD },
      data: { status: AppointmentStatus.EXPIRED },
    });
  }
}
