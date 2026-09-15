export const AppointmentStatus = {
  SCHEDULED: 'scheduled',
  HELD: 'held',
  CONFIRMED: 'confirmed',
  ATTENDED: 'attended',
  EXPIRED: 'expired',
} as const;
export type AppointmentStatus =
  (typeof AppointmentStatus)[keyof typeof AppointmentStatus];

export const AppointmentSource = {
  PUBLIC_WEB: 'public_web',
  WHATSAPP: 'whatsapp',
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
    readonly status: string,
    readonly source: string,
    /** @deprecated Reemplazado por guestFirstName/guestLastNamePaternal/guestLastNameMaternal (CLI-43). Se conserva como respaldo auditable de filas anteriores, ya no se escribe. */
    readonly guestFullName: string | null,
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
