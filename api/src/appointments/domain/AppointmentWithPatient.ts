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
    readonly guestFirstName: string | null,
    readonly guestLastNamePaternal: string | null,
    readonly guestPhone: string | null,
    /** Doctor del turno (CLI-110) — la agenda común lo muestra con su color. */
    readonly doctorId: string,
    readonly doctorName: string | null,
    readonly doctorColor: string | null,
    /** CLI-148: la agenda dibuja el turno con su duración real y distingue las citas agendadas por el doctor de las reservas web. */
    readonly durationMinutes: number,
    readonly source: string,
    readonly treatmentId: string | null,
    readonly treatmentName: string | null,
    readonly notes: string | null,
  ) {}
}
