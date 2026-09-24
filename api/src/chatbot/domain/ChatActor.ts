import type { UserRole } from '../../auth/domain/value-objects/UserRole';

/** Visitante sin sesión (landing, o un número de WhatsApp sin vincular). */
export interface AnonymousActor {
  readonly kind: 'anonymous';
}

/**
 * Usuario autenticado. Lo arma el backend a partir de la fila `users` (nunca
 * del JWT ni del texto del mensaje): `role` es `users.role`, no el claim
 * `role` del token de Supabase.
 */
export interface UserActor {
  readonly kind: 'user';
  /** users.id — no el auth_user_id de Supabase. */
  readonly userId: string;
  readonly role: UserRole;
  /** patients.id, solo si es un paciente con ficha; null en cualquier otro caso. */
  readonly patientId: string | null;
}

export type ChatActor = AnonymousActor | UserActor;

export const ANONYMOUS_ROLE = 'anonymous';

/** Rol con el que se autorizan las tools: el de la app, o `anonymous`. */
export type ActorRole = UserRole | typeof ANONYMOUS_ROLE;

export function actorRole(actor: ChatActor): ActorRole {
  return actor.kind === 'user' ? actor.role : ANONYMOUS_ROLE;
}
