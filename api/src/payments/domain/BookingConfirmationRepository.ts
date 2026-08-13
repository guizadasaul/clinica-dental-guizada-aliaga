export interface ConfirmBookingData {
  appointmentId: string;
  paidAt: Date;
  amount: number;
  qrId: string;
  guestFullName: string;
  guestPhone: string;
}

export interface ConfirmedBooking {
  appointmentId: string;
  patientId: string;
  userId: string;
}

/**
 * Puerto transaccional que compone User (placeholder) + Patient + Appointment
 * en una sola operación al confirmarse el pago. Vive en payments/ (no en
 * auth/ ni patients/) porque ningún puerto existente acepta un handle de
 * transacción — threadearlo ahí filtraría Prisma al dominio de esos módulos.
 */
export interface IBookingConfirmationRepository {
  /** UPDATE condicional (WHERE id AND status='held'). null si el hold ya no estaba held (webhook duplicado). */
  confirmPaidBooking(
    data: ConfirmBookingData,
  ): Promise<ConfirmedBooking | null>;
}

export const BookingConfirmationRepository = Symbol(
  'IBookingConfirmationRepository',
);
