import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service.js';
import type {
  ChatRepository,
  CreateChatSessionData,
  NewChatMessageData,
} from '../../domain/ChatRepository.js';
import type { ChatMessage } from '../../domain/ChatMessage.js';
import type { ChatSession } from '../../domain/ChatSession.js';
import { ChatMapper } from './chat.mapper.js';

@Injectable()
export class PrismaChatRepository implements ChatRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createSession(data: CreateChatSessionData): Promise<ChatSession> {
    const record = await this.prisma.chat_sessions.create({
      data: {
        user_id: data.userId,
        channel: data.channel,
        anon_token_hash: data.anonTokenHash,
      },
    });
    return ChatMapper.toSession(record);
  }

  async findSessionForUser(
    sessionId: string,
    userId: string,
  ): Promise<ChatSession | null> {
    const record = await this.prisma.chat_sessions.findFirst({
      where: { id: sessionId, user_id: userId },
    });
    return record ? ChatMapper.toSession(record) : null;
  }

  async findSessionByAnonTokenHash(
    anonTokenHash: string,
  ): Promise<ChatSession | null> {
    const record = await this.prisma.chat_sessions.findUnique({
      where: { anon_token_hash: anonTokenHash },
    });
    return record ? ChatMapper.toSession(record) : null;
  }

  appendMessage(
    sessionId: string,
    data: NewChatMessageData,
  ): Promise<ChatMessage> {
    return this.prisma.transaction(async (tx) => {
      const record = await tx.chat_messages.create({
        data: {
          session_id: sessionId,
          role: data.role,
          content: data.content,
          tool_names: data.toolNames ?? [],
          latency_ms: data.latencyMs ?? null,
          prompt_tokens: data.promptTokens ?? null,
          completion_tokens: data.completionTokens ?? null,
          error_code: data.errorCode ?? null,
        },
      });
      await tx.chat_sessions.update({
        where: { id: sessionId },
        data: { last_activity_at: record.created_at },
      });
      return ChatMapper.toMessage(record);
    });
  }

  async findRecentMessages(
    sessionId: string,
    limit: number,
  ): Promise<ChatMessage[]> {
    const records = await this.prisma.chat_messages.findMany({
      where: { session_id: sessionId },
      orderBy: { created_at: 'desc' },
      take: limit,
    });
    // Se piden los más nuevos (desc + take) y se devuelven cronológicos.
    return records.reverse().map((record) => ChatMapper.toMessage(record));
  }

  countUserMessagesSince(userId: string, since: Date): Promise<number> {
    return this.prisma.chat_messages.count({
      where: {
        role: 'user',
        created_at: { gte: since },
        chat_sessions: { user_id: userId },
      },
    });
  }

  countAnonMessagesSince(anonTokenHash: string, since: Date): Promise<number> {
    return this.prisma.chat_messages.count({
      where: {
        role: 'user',
        created_at: { gte: since },
        chat_sessions: { anon_token_hash: anonTokenHash },
      },
    });
  }

  async deleteSessionForUser(
    sessionId: string,
    userId: string,
  ): Promise<boolean> {
    const { count } = await this.prisma.chat_sessions.deleteMany({
      where: { id: sessionId, user_id: userId },
    });
    return count > 0;
  }

  async deleteAllForUser(userId: string): Promise<number> {
    const { count } = await this.prisma.chat_sessions.deleteMany({
      where: { user_id: userId },
    });
    return count;
  }

  async deleteInactiveSince(date: Date): Promise<number> {
    const { count } = await this.prisma.chat_sessions.deleteMany({
      where: { last_activity_at: { lt: date } },
    });
    return count;
  }
}
