export const AppointmentStatus = {
  SCHEDULED: 'scheduled',
  HELD: 'held',
  CONFIRMED: 'confirmed',
  ATTENDED: 'attended',
  EXPIRED: 'expired',
  /** CLI-149: cancelada por el doctor — libera el turno. */
  CANCELLED: 'cancelled',
  /** CLI-208: el doctor marcó que el paciente no vino — solo citas confirmadas que ya pasaron. No cuenta como visita. */
  NO_SHOW: 'no_show',
} as const;
export type AppointmentStatus =
  (typeof AppointmentStatus)[keyof typeof AppointmentStatus];

export const AppointmentSource = {
  PUBLIC_WEB: 'public_web',
  WHATSAPP: 'whatsapp',
  /** CLI-148: cita agendada por el doctor desde su agenda (seguimiento de un paciente con ficha) — nace confirmada, sin pago previo. */
  DOCTOR: 'doctor',
} as const;
export type AppointmentSource =
  (typeof AppointmentSource)[keyof typeof AppointmentSource];

export const HOLD_TTL_MINUTES = 10;

export class Appointment {
  constructor(
    readonly id: string,
    readonly patientId: string | null,
    readonly treatmentId: string | null,
    readonly appointmentDatetime: Date,
    /** Congelada al reservar (CLI-47) — ver AppointmentRepository.CreateHoldData. */
    readonly durationMinutes: number,
    readonly status: string,
    readonly source: string,
    readonly guestFirstName: string | null,
    readonly guestLastNamePaternal: string | null,
    readonly guestLastNameMaternal: string | null,
    readonly guestPhone: string | null,
    readonly guestEmail: string | null,
    readonly holdExpiresAt: Date | null,
    readonly notes: string | null,
    readonly createdAt: Date,
    readonly banecoQrId: string | null,
    readonly banecoTransactionId: string | null,
    readonly banecoQrImage: string | null,
    readonly paymentAmount: number | null,
    readonly paidAt: Date | null,
  ) {}

  isHoldActive(now: Date = new Date()): boolean {
    return (
      this.status === AppointmentStatus.HELD &&
      this.holdExpiresAt !== null &&
      this.holdExpiresAt.getTime() > now.getTime()
    );
  }
}
