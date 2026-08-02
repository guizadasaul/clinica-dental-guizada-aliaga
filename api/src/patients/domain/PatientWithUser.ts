import type { Patient } from './Patient';

export class PatientWithUser {
  constructor(
    readonly userId: string,
    readonly displayName: string | null,
    readonly email: string | null,
    readonly phone: string | null,
    readonly createdAt: Date,
    readonly patient: Patient | null,
    readonly odontogramEntriesCount: number,
  ) {}
}
