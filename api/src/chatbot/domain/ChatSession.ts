import type { ChatChannel } from './ChatChannel';

/**
 * Una conversación del chatbot. `userId` null = visitante anónimo, que se
 * identifica solo por el hash de su token opaco (nunca expuesto acá).
 */
export interface ChatSession {
  id: string;
  userId: string | null;
  channel: ChatChannel;
  createdAt: Date;
  lastActivityAt: Date;
}
