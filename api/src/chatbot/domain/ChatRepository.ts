import type { ChatChannel } from './ChatChannel';
import type { ChatMessage, ChatMessageRole } from './ChatMessage';
import type { ChatSession } from './ChatSession';
import type { ChatTurnRecord } from './ChatUsage';

export interface CreateChatSessionData {
  /** users.id, o null para un visitante anónimo. */
  userId: string | null;
  channel: ChatChannel;
  /** sha256 del token opaco del visitante; null para una sesión de usuario. */
  anonTokenHash: string | null;
}

export interface NewChatMessageData {
  role: ChatMessageRole;
  content: string;
  toolNames?: string[];
  latencyMs?: number | null;
  promptTokens?: number | null;
  completionTokens?: number | null;
  errorCode?: string | null;
  /** Tools denegadas por la matriz en el turno (auditoría, CLI-98). */
  deniedTools?: number;
}

/**
 * Puerto de persistencia del chatbot. A propósito no existe ningún
 * `findById` suelto: toda lectura o borrado de una sesión identifica al
 * dueño en la misma consulta (usuario, o hash del token anónimo), así que no
 * hay forma de llegar a la conversación de otro por error.
 */
export interface ChatRepository {
  createSession(data: CreateChatSessionData): Promise<ChatSession>;
  /** null si no existe o si es de otro usuario (el llamador no distingue). */
  findSessionForUser(
    sessionId: string,
    userId: string,
  ): Promise<ChatSession | null>;
  findSessionByAnonTokenHash(
    anonTokenHash: string,
  ): Promise<ChatSession | null>;
  /** Guarda el mensaje y actualiza last_activity_at de la sesión, en una transacción. */
  appendMessage(
    sessionId: string,
    data: NewChatMessageData,
  ): Promise<ChatMessage>;
  /** Los últimos `limit` mensajes, en orden cronológico (el más viejo primero). */
  findRecentMessages(sessionId: string, limit: number): Promise<ChatMessage[]>;
  /** Mensajes con role='user' del usuario desde `since`, en todas sus sesiones (cuota diaria). */
  countUserMessagesSince(userId: string, since: Date): Promise<number>;
  /** Ídem para la sesión anónima de ese token. */
  countAnonMessagesSince(anonTokenHash: string, since: Date): Promise<number>;
  /** true si la borró; false si no existe o es de otro usuario. */
  deleteSessionForUser(sessionId: string, userId: string): Promise<boolean>;
  /** Cantidad de sesiones borradas. */
  deleteAllForUser(userId: string): Promise<number>;
  /** Turnos respondidos en [from, to), con canal y rol de quien chateó (métricas de uso). */
  findAssistantTurnsBetween(from: Date, to: Date): Promise<ChatTurnRecord[]>;
  /** Borra las sesiones sin actividad desde `date` (retención). Cantidad borrada. */
  deleteInactiveSince(date: Date): Promise<number>;
}

export const ChatRepository = Symbol('ChatRepository');
