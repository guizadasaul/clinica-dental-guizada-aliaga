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
    readonly guestFullName: string | null,
    readonly guestPhone: string | null,
  ) {}
}
