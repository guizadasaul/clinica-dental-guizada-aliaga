export type ChatMessageRole = 'user' | 'assistant';

/**
 * Un mensaje persistido. Solo texto user/assistant y metadata de uso: nunca
 * los argumentos ni los resultados de las tools (minimización de datos).
 */
export interface ChatMessage {
  id: string;
  sessionId: string;
  role: ChatMessageRole;
  content: string;
  /** Solo los nombres de las tools usadas en el turno (métricas). */
  toolNames: string[];
  latencyMs: number | null;
  promptTokens: number | null;
  completionTokens: number | null;
  errorCode: string | null;
  createdAt: Date;
}
