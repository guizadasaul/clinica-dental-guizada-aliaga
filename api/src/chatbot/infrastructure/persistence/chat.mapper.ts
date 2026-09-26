import type {
  chat_messages,
  chat_sessions,
  UserRole as PrismaUserRole,
} from '@prisma/client';
import { ANONYMOUS_ROLE } from '../../domain/ChatActor';
import type { ActorRole } from '../../domain/ChatActor';
import type { ChatChannel } from '../../domain/ChatChannel';
import type { ChatTurnRecord } from '../../domain/ChatUsage';
import type { ChatMessage, ChatMessageRole } from '../../domain/ChatMessage';
import type { ChatSession } from '../../domain/ChatSession';

export interface ChatTurnRow {
  created_at: Date;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  error_code: string | null;
  denied_tools: number;
  chat_sessions: {
    id: string;
    channel: string;
    user_id: string | null;
    users: { role: PrismaUserRole } | null;
  };
}

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

  static toTurnRecord(row: ChatTurnRow): ChatTurnRecord {
    const session = row.chat_sessions;
    return {
      createdAt: row.created_at,
      channel: session.channel as ChatChannel,
      role: (session.users?.role ?? ANONYMOUS_ROLE) as ActorRole,
      actorKey: session.user_id ?? `anon:${session.id}`,
      promptTokens: row.prompt_tokens ?? 0,
      completionTokens: row.completion_tokens ?? 0,
      errorCode: row.error_code,
      deniedTools: row.denied_tools,
    };
  }
}
