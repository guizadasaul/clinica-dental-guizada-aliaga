/** Read model para la agenda del doctor — cita + datos básicos del paciente embebidos. */
export class AppointmentWithPatient {
  constructor(
    readonly id: string,
    readonly appointmentDatetime: Date,
    readonly status: string,
    readonly patientId: string | null,
    readonly patientFirstName: string | null,
    readonly patientLastNamePaternal: string | null,
    readonly patientPhone: string | null,
    readonly patientEmail: string | null,
    /** @deprecated Ver Appointment.guestFullName (CLI-43). */
    readonly guestFullName: string | null,
    readonly guestFirstName: string | null,
    readonly guestLastNamePaternal: string | null,
    readonly guestPhone: string | null,
  ) {}
}
