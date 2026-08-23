import type { Patient } from './Patient';

export class PatientWithUser {
  constructor(
    readonly userId: string,
    readonly displayName: string | null,
    readonly email: string | null,
    readonly phone: string | null,
    readonly createdAt: Date,
    readonly patient: Patient | null,
    /** Versiones de dental_exams del paciente — 0 significa que todavía no tiene ningún examen dental registrado (CLI-40). */
    readonly dentalExamsCount: number,
    readonly hasAccount: boolean,
  ) {}
}
