import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service.js';
import { UserMapper } from '../../../auth/infrastructure/persistence/user.mapper.js';
import {
  ConfirmBookingData,
  ConfirmedBooking,
  IBookingConfirmationRepository,
} from '../../domain/BookingConfirmationRepository.js';

@Injectable()
export class PrismaBookingConfirmationRepository implements IBookingConfirmationRepository {
  constructor(private readonly prisma: PrismaService) {}

  async confirmPaidBooking(
    data: ConfirmBookingData,
  ): Promise<ConfirmedBooking | null> {
    return this.prisma.transaction(async (tx) => {
      // Guard atómico — el mismo patrón que linkAuthIdentity (CLI-9): un
      // webhook/poll duplicado lee count === 0 y sale ANTES de crear nada.
      const claimed = await tx.appointments.updateMany({
        where: { id: data.appointmentId, status: 'held' },
        data: {
          status: 'confirmed',
          paid_at: data.paidAt,
          payment_amount: data.amount,
          baneco_qr_id: data.qrId,
        },
      });
      if (claimed.count === 0) {
        return null;
      }

      const displayName = [
        data.guestFirstName,
        data.guestLastNamePaternal,
        data.guestLastNameMaternal,
      ]
        .filter(Boolean)
        .join(' ');
      const user = await tx.users.create({
        data: UserMapper.toPlaceholderCreateInput({
          displayName,
          phone: data.guestPhone,
          email: data.guestEmail,
        }),
      });
      // El teléfono NO se repite acá — ya quedó en users.phone vía
      // UserMapper.toPlaceholderCreateInput arriba (CLI-51: users.phone es
      // la única fuente de verdad, patients ya no tiene columna propia).
      const patient = await tx.patients.create({
        data: {
          user_id: user.id,
          first_name: data.guestFirstName,
          last_name_paternal: data.guestLastNamePaternal,
          last_name_maternal: data.guestLastNameMaternal,
        },
      });
      await tx.appointments.update({
        where: { id: data.appointmentId },
        data: { patient_id: patient.id },
      });

      return {
        appointmentId: data.appointmentId,
        patientId: patient.id,
        userId: user.id,
      };
    });
  }
}
