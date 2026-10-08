import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service.js';
import { UserMapper } from '../../../auth/infrastructure/persistence/user.mapper.js';
import {
  ConfirmBookingData,
  ConfirmedBooking,
  IBookingConfirmationRepository,
} from '../../domain/BookingConfirmationRepository.js';
import { attachWebConsultation } from './web-consultation-writes.js';

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

      // CLI-58: el doctor asignado al crear la ficha es el de la cita que la
      // originó — se lee de la propia appointment en vez de que el caller lo
      // pase por separado (una sola fuente de verdad, sin riesgo de que
      // diverja del doctor real de la cita que se está confirmando).
      const { doctor_id: doctorId } = await tx.appointments.findUniqueOrThrow({
        where: { id: data.appointmentId },
        select: { doctor_id: true },
      });

      const displayName = [
        data.guestFirstName,
        data.guestLastNamePaternal,
        data.guestLastNameMaternal,
      ]
        .filter(Boolean)
        .join(' ');
      // Si el email de guest ya es una cuenta existente, reusarla en vez de
      // crear una nueva — Postgres aborta toda la transacción ante un P2002
      // (no hay forma de "atrapar y seguir" sin SAVEPOINT), así que hay que
      // chequear antes de intentar el create, no reaccionar después.
      const user =
        (data.guestEmail &&
          (await tx.users.findFirst({
            where: { email: data.guestEmail, is_active: true },
          }))) ||
        (await tx.users.create({
          data: UserMapper.toPlaceholderCreateInput({
            displayName,
            phone: data.guestPhone,
            email: data.guestEmail,
          }),
        }));
      // El teléfono NO se repite acá — ya quedó en users.phone vía
      // UserMapper.toPlaceholderCreateInput arriba (CLI-51: users.phone es
      // la única fuente de verdad, patients ya no tiene columna propia).
      const patient =
        (await tx.patients.findUnique({ where: { user_id: user.id } })) ??
        (await tx.patients.create({
          data: {
            user_id: user.id,
            first_name: data.guestFirstName,
            last_name_paternal: data.guestLastNamePaternal,
            last_name_maternal: data.guestLastNameMaternal,
            assigned_doctor_id: doctorId,
          },
        }));
      await tx.appointments.update({
        where: { id: data.appointmentId },
        data: { patient_id: patient.id },
      });

      // CLI-257: la consulta pagada va a su presupuesto, con el pago aplicado
      // a esa línea. En la misma transacción: si algo falla, la reserva no
      // queda confirmada a medias.
      if (data.treatmentId) {
        await attachWebConsultation(tx, {
          appointmentId: data.appointmentId,
          patientId: patient.id,
          treatmentId: data.treatmentId,
          amount: data.amount,
          paidAt: data.paidAt,
        });
      }

      return {
        appointmentId: data.appointmentId,
        patientId: patient.id,
        userId: user.id,
      };
    });
  }
}
