/** Canales externos que se pueden vincular a una cuenta (hoy, solo WhatsApp). */
export type LinkableChannel = 'whatsapp';

/**
 * Un número de un canal externo vinculado a una cuenta (CLI-100). La
 * posesión se probó con un código de un solo uso enviado desde ese número;
 * nunca se infiere de users.phone, que lo carga un tercero y no es único.
 */
export interface ChannelIdentity {
  id: string;
  userId: string;
  channel: LinkableChannel;
  /** E.164, ej. +59171234567 */
  externalId: string;
  verifiedAt: Date;
  revokedAt: Date | null;
}

export interface NewLinkCodeData {
  userId: string;
  channel: LinkableChannel;
  codeHash: string;
  expiresAt: Date;
}

export interface LinkIdentityResult {
  identity: ChannelIdentity;
  /** Cuenta que tenía ese número vinculado y lo perdió (para avisarle por el canal). */
  previousUserId: string | null;
}

/**
 * Persistencia de la vinculación. Toda consulta de códigos filtra por
 * vigencia (sin usar y sin vencer) en la misma operación.
 */
export interface ChannelIdentityRepository {
  /** Borra los códigos sin usar del usuario en ese canal y guarda el nuevo, en una transacción. */
  replaceLinkCode(data: NewLinkCodeData): Promise<void>;
  /** true si hay un código vigente con ese hash (para no repetir uno activo). */
  hasActiveLinkCode(codeHash: string, now: Date): Promise<boolean>;
  /** Marca como usado el código vigente con ese hash y devuelve su dueño; null si no hay. */
  consumeLinkCode(
    channel: LinkableChannel,
    codeHash: string,
    now: Date,
  ): Promise<string | null>;
  countFailedAttemptsSince(
    channel: LinkableChannel,
    externalId: string,
    since: Date,
  ): Promise<number>;
  recordAttempt(
    channel: LinkableChannel,
    externalId: string,
    succeeded: boolean,
  ): Promise<void>;
  /**
   * Vincula el número al usuario. Si estaba vinculado a otra cuenta, revoca
   * ese vínculo en la misma transacción; si ya era de este usuario, lo deja.
   */
  linkIdentity(
    userId: string,
    channel: LinkableChannel,
    externalId: string,
    now: Date,
  ): Promise<LinkIdentityResult>;
  findActiveByExternalId(
    channel: LinkableChannel,
    externalId: string,
  ): Promise<ChannelIdentity | null>;
  findActiveForUser(userId: string): Promise<ChannelIdentity[]>;
  /** true si revocó un vínculo activo de ese usuario; false si no existe o es de otro. */
  revokeForUser(id: string, userId: string, now: Date): Promise<boolean>;
  /** Borra códigos vencidos o usados e intentos anteriores a `date` (retención). */
  purgeLinkDataBefore(date: Date): Promise<number>;
}

export const ChannelIdentityRepository = Symbol('ChannelIdentityRepository');
