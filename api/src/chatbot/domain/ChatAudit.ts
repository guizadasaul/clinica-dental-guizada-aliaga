import { actorRole } from './ChatActor';
import type { ActorRole, ChatActor } from './ChatActor';

/**
 * Identidad redactada de un turno para los eventos de auditoría (CLI-98). El
 * usuario va por `users.id` (nunca email ni nombre) y el visitante por un
 * prefijo del hash de su token: suficiente para correlacionar, sin exponer
 * nada que sirva para retomar la conversación.
 */
export interface ChatAuditContext {
  requestId: string | null;
  actor: string;
  role: ActorRole;
}

export type ChatSecurityReason =
  | 'not_allowed'
  | 'identity_field_in_arguments'
  // No se distingue "ajena" de "no existe" (tampoco se le dice al cliente):
  // incluye las conversaciones que ya borró la retención.
  | 'foreign_or_unknown_session'
  | 'daily_quota_exceeded';

const ANON_HASH_PREFIX = 8;

export function chatAuditContext(
  requestId: string | null,
  actor: ChatActor,
  anonTokenHash: string | null,
): ChatAuditContext {
  const role = actorRole(actor);
  if (actor.kind === 'user') {
    return { requestId, actor: `user:${actor.userId}`, role };
  }
  const anonRef = anonTokenHash
    ? anonTokenHash.slice(0, ANON_HASH_PREFIX)
    : 'new';
  return { requestId, actor: `anon:${anonRef}`, role };
}
