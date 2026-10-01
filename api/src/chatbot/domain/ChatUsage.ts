import type { ActorRole } from './ChatActor';
import type { ChatChannel } from './ChatChannel';

/**
 * Un turno respondido (mensaje del assistant) con su metadata de uso, sin
 * contenido: la base de las métricas de GET /admin/chatbot/usage (CLI-98).
 */
export interface ChatTurnRecord {
  createdAt: Date;
  channel: ChatChannel;
  role: ActorRole;
  /** users.id, o el id de la conversación para un visitante anónimo. */
  actorKey: string;
  promptTokens: number;
  completionTokens: number;
  errorCode: string | null;
  deniedTools: number;
}
