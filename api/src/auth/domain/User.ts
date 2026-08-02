import { UserRole } from './value-objects/UserRole';

export class User {
  constructor(
    readonly id: string,
    readonly firebaseUid: string,
    readonly email: string | null,
    readonly role: UserRole,
    readonly displayName: string | null,
    readonly phone: string | null,
    readonly photoUrl: string | null,
    readonly passwordHash: string | null,
    readonly isActive: boolean,
    readonly createdAt: Date,
    readonly updatedAt: Date,
  ) {}
}
