import type { PatientInvite } from './PatientInvite';
import type { InviteEmailKind } from './EmailSender';

export interface CreateInviteData {
  userId: string;
  patientId?: string | null;
  channel: string;
  tokenHash: string;
  expiresAt: Date;
}

export interface RedeemedInvite {
  userId: string;
  patientId: string | null;
}

export interface InviteTokenStatus {
  valid: boolean;
  kind: InviteEmailKind;
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
   * user, sin importar el canal. Se llama antes de crear un invite nuevo
   * para que un link viejo (mandado por error, a la casilla equivocada, o
   * simplemente reemplazado) deje de servir de inmediato en vez de quedar
   * válido en paralelo hasta que venza o alguien lo use.
   */
  invalidatePendingForUser(userId: string, now: Date): Promise<void>;

  /**
   * Atómico: UPDATE condicional (WHERE token_hash AND used_at IS NULL AND
   * expires_at > now) — mismo patrón que linkAuthIdentity/confirmPaidBooking.
   * Si matchea, además marca TODOS los invites pendientes de ese user_id
   * como usados (no solo el que matcheó). null si no había nada válido.
   */
  redeemByTokenHash(
    tokenHash: string,
    now: Date,
  ): Promise<RedeemedInvite | null>;

  /** Lee patients+users directo (no depende de PatientsModule). null si el patient no existe. */
  findPatientContactInfo(patientId: string): Promise<PatientContactInfo | null>;

  /**
   * Chequeo de solo lectura — nunca consume el token. Para /invitacion/:token
   * antes de mandar a Google. null si el token no existe; si existe devuelve
   * si sigue siendo canjeable y a quién iba dirigido (`kind`, derivado del rol
   * del user invitado), aunque ya esté vencido o usado — así la landing puede
   * decir a quién pedirle el reenvío.
   */
  findTokenStatus(
    tokenHash: string,
    now: Date,
  ): Promise<InviteTokenStatus | null>;
}

export const PatientInviteRepository = Symbol('IPatientInviteRepository');
