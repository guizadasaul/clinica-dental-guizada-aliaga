export const PasswordResetLinkRepository = Symbol(
  'PasswordResetLinkRepository',
);

/** Lo que hace falta de la ficha para armar el link (CLI-244). */
export interface PatientAccount {
  userId: string;
  /** null si el paciente todavía no creó su cuenta. */
  authUserId: string | null;
  fullName: string;
  phone: string | null;
}

export interface ResetLinkStatus {
  valid: boolean;
  phone: string | null;
}

export interface RedeemedResetLink {
  authUserId: string;
}

export interface IPasswordResetLinkRepository {
  /** null si la ficha no existe o está eliminada. */
  findPatientAccount(patientId: string): Promise<PatientAccount | null>;

  /** Invalida los links pendientes del usuario y guarda el nuevo, en una sola transacción. */
  replaceForUser(
    userId: string,
    tokenHash: string,
    expiresAt: Date,
    now: Date,
  ): Promise<void>;

  findStatus(tokenHash: string, now: Date): Promise<ResetLinkStatus | null>;

  /** Marca el link como usado si sigue vigente (atómico); null si no. */
  redeem(tokenHash: string, now: Date): Promise<RedeemedResetLink | null>;

  /** Devuelve el link a vigente si el cambio de contraseña falló después de canjearlo. */
  release(tokenHash: string): Promise<void>;
}
