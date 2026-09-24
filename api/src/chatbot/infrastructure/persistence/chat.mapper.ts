import type { chat_messages, chat_sessions } from '@prisma/client';
import type { ChatChannel } from '../../domain/ChatChannel';
import type { ChatMessage, ChatMessageRole } from '../../domain/ChatMessage';
import type { ChatSession } from '../../domain/ChatSession';

/** Los CHECK de la migración (CLI-84) garantizan los valores de channel y role. */
export class ChatMapper {
  static toSession(record: chat_sessions): ChatSession {
    return {
      id: record.id,
      userId: record.user_id,
      channel: record.channel as ChatChannel,
      createdAt: record.created_at,
      lastActivityAt: record.last_activity_at,
    };
  }

  static toMessage(record: chat_messages): ChatMessage {
    return {
      id: record.id,
      sessionId: record.session_id,
      role: record.role as ChatMessageRole,
      content: record.content,
      toolNames: record.tool_names,
      latencyMs: record.latency_ms,
      promptTokens: record.prompt_tokens,
      completionTokens: record.completion_tokens,
      errorCode: record.error_code,
      createdAt: record.created_at,
    };
  }
}
