import type { PatientInvite } from './PatientInvite';

export interface CreateInviteData {
  patientId: string;
  channel: string;
  tokenHash: string;
  expiresAt: Date;
}

export interface RedeemedInvite {
  patientId: string;
  userId: string;
}

export interface PatientContactInfo {
  userId: string;
  fullName: string;
  phone: string | null;
  email: string | null;
}

export interface IPatientInviteRepository {
  create(data: CreateInviteData): Promise<PatientInvite>;

  /**
   * Marca como usados todos los invites pendientes (`used_at IS NULL`) de un
   * patient, sin importar el canal. Se llama antes de crear un invite nuevo
   * para que un link viejo (mandado por error, a la casilla equivocada, o
   * simplemente reemplazado) deje de servir de inmediato en vez de quedar
   * válido en paralelo hasta que venza o alguien lo use.
   */
  invalidatePendingForPatient(patientId: string, now: Date): Promise<void>;

  /**
   * Atómico: UPDATE condicional (WHERE token_hash AND used_at IS NULL AND
   * expires_at > now) — mismo patrón que linkAuthIdentity/confirmPaidBooking.
   * Si matchea, además marca TODOS los invites pendientes de ese patient_id
   * como usados (no solo el que matcheó). null si no había nada válido.
   */
  redeemByTokenHash(
    tokenHash: string,
    now: Date,
  ): Promise<RedeemedInvite | null>;

  /** Lee patients+users directo (no depende de PatientsModule). null si el patient no existe. */
  findPatientContactInfo(patientId: string): Promise<PatientContactInfo | null>;

  /** Chequeo de solo lectura — nunca consume el token. Para /invitacion/:token antes de mandar a Google. */
  isTokenValid(tokenHash: string, now: Date): Promise<boolean>;
}

export const PatientInviteRepository = Symbol('IPatientInviteRepository');
