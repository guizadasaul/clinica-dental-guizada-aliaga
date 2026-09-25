import { createHash, randomBytes } from 'node:crypto';
import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { ChatActor } from '../domain/ChatActor';
import type { ChatChannel } from '../domain/ChatChannel';
import { ChatRepository } from '../domain/ChatRepository';
import type { ChatRepository as IChatRepository } from '../domain/ChatRepository';
import type { ChatSession } from '../domain/ChatSession';
import type { ChatLink } from '../domain/ChatLink';
import type { LlmMessage } from '../domain/LlmProvider';
import { readEnvInt } from '../../shared/env.util';
import { AgentRunner } from './agent-runner';
import type { ChatLocale } from './fallback-reply';
import { SystemPromptBuilder } from './system-prompt.builder';

export const DEFAULT_CONTEXT_MESSAGES = 12;
export const DEFAULT_CONTEXT_MAX_CHARS = 8000;
export const DEFAULT_DAILY_MESSAGES_USER = 100;
export const DEFAULT_DAILY_MESSAGES_ANON = 20;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Entrada única del chatbot para todos los canales (web, WhatsApp). El
 * `actor` llega ya resuelto por el canal a partir de la autenticación —
 * nunca se deriva del texto del mensaje.
 */
export interface IncomingChatMessage {
  actor: ChatActor;
  channel: ChatChannel;
  /** Conversación existente de un usuario autenticado. */
  sessionId?: string;
  /** Token opaco de la conversación de un visitante anónimo. */
  anonToken?: string;
  text: string;
  locale?: ChatLocale;
}

export interface ChatReply {
  /** id de la conversación (para un usuario, lo que manda en el próximo mensaje). */
  sessionId: string;
  /** Solo para anónimos: el token a reenviar para seguir la conversación. */
  anonToken: string | null;
  reply: string;
  /** Links para mostrar junto a la respuesta (ej. el de reserva). */
  links: ChatLink[];
}

interface ResolvedSession {
  session: ChatSession;
  anonToken: string | null;
}

export function hashAnonToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Orquesta un turno (CLI-85): resuelve la conversación del actor, persiste
 * el mensaje, arma la ventana de contexto y corre el agente. No sabe nada de
 * HTTP ni de WhatsApp: el canal llega como dato.
 */
@Injectable()
export class ChatService {
  constructor(
    @Inject(ChatRepository) private readonly chatRepo: IChatRepository,
    private readonly agent: AgentRunner,
    private readonly promptBuilder: SystemPromptBuilder,
  ) {}

  async handleMessage(message: IncomingChatMessage): Promise<ChatReply> {
    const started = Date.now();
    this.ensureEnabled();
    // Antes de resolver la sesión: sin cupo no se crea ninguna conversación.
    await this.ensureWithinDailyQuota(message.actor, message.anonToken);
    const { session, anonToken } = await this.resolveSession(message);

    await this.chatRepo.appendMessage(session.id, {
      role: 'user',
      content: message.text,
    });
    const history = await this.loadHistory(session.id);

    const result = await this.agent.run({
      actor: message.actor,
      system: this.promptBuilder.build(message.actor, new Date()),
      history,
      locale: message.locale,
    });

    await this.chatRepo.appendMessage(session.id, {
      role: 'assistant',
      content: result.reply,
      toolNames: result.toolNames,
      latencyMs: Date.now() - started,
      promptTokens: result.usage.promptTokens,
      completionTokens: result.usage.completionTokens,
      errorCode: result.errorCode,
    });

    return {
      sessionId: session.id,
      anonToken,
      reply: result.reply,
      links: result.links,
    };
  }

  /** Borra una conversación propia. 404 si no existe o es de otro usuario. */
  async deleteSession(userId: string, sessionId: string): Promise<void> {
    const deleted = await this.chatRepo.deleteSessionForUser(sessionId, userId);
    if (!deleted) {
      throw new NotFoundException('Conversación no encontrada');
    }
  }

  /** Borra todas las conversaciones del usuario (derecho a borrar su historial). */
  async deleteAllSessions(userId: string): Promise<void> {
    await this.chatRepo.deleteAllForUser(userId);
  }

  /** Kill switch: el chat queda apagado salvo CHATBOT_ENABLED="true". */
  private ensureEnabled(): void {
    if (process.env['CHATBOT_ENABLED'] !== 'true') {
      throw new ServiceUnavailableException(
        'El asistente no está disponible en este momento',
      );
    }
  }

  /**
   * Cuota diaria desde la base (el throttler es en memoria y por IP): mensajes
   * del usuario en las últimas 24 h, en todas sus conversaciones; para un
   * anónimo, los de su conversación (el rate limit por IP cubre el resto).
   */
  private async ensureWithinDailyQuota(
    actor: ChatActor,
    anonToken: string | undefined,
  ): Promise<void> {
    const since = new Date(Date.now() - DAY_MS);
    let sent: number;
    let limit: number;
    if (actor.kind === 'user') {
      sent = await this.chatRepo.countUserMessagesSince(actor.userId, since);
      limit = readEnvInt(
        'CHAT_DAILY_MESSAGES_USER',
        DEFAULT_DAILY_MESSAGES_USER,
      );
    } else {
      sent = anonToken
        ? await this.chatRepo.countAnonMessagesSince(
            hashAnonToken(anonToken),
            since,
          )
        : 0;
      limit = readEnvInt(
        'CHAT_DAILY_MESSAGES_ANON',
        DEFAULT_DAILY_MESSAGES_ANON,
      );
    }
    if (sent >= limit) {
      throw new HttpException(
        'Alcanzaste el límite diario de mensajes del asistente',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private async resolveSession(
    message: IncomingChatMessage,
  ): Promise<ResolvedSession> {
    const { actor } = message;
    if (actor.kind === 'user') {
      if (message.sessionId) {
        const session = await this.chatRepo.findSessionForUser(
          message.sessionId,
          actor.userId,
        );
        // Misma respuesta para "no existe" y "es de otro usuario": no se
        // confirma la existencia de conversaciones ajenas.
        if (!session) {
          throw new NotFoundException('Conversación no encontrada');
        }
        return { session, anonToken: null };
      }
      const session = await this.chatRepo.createSession({
        userId: actor.userId,
        channel: message.channel,
        anonTokenHash: null,
      });
      return { session, anonToken: null };
    }

    if (message.anonToken) {
      const session = await this.chatRepo.findSessionByAnonTokenHash(
        hashAnonToken(message.anonToken),
      );
      if (session) {
        return { session, anonToken: message.anonToken };
      }
    }
    // Sin token, o con uno cuya conversación ya no existe (retención): se
    // emite uno nuevo generado por el servidor, nunca uno elegido por el cliente.
    const anonToken = randomBytes(32).toString('base64url');
    const session = await this.chatRepo.createSession({
      userId: null,
      channel: message.channel,
      anonTokenHash: hashAnonToken(anonToken),
    });
    return { session, anonToken };
  }

  /**
   * Últimos CHAT_CONTEXT_MESSAGES mensajes (solo user/assistant: los
   * resultados de tools de turnos anteriores no se guardan ni se reenvían),
   * recortando desde el más viejo si superan CHAT_CONTEXT_MAX_CHARS. El
   * mensaje actual del usuario siempre queda.
   */
  private async loadHistory(sessionId: string): Promise<LlmMessage[]> {
    const limit = readEnvInt('CHAT_CONTEXT_MESSAGES', DEFAULT_CONTEXT_MESSAGES);
    const maxChars = readEnvInt(
      'CHAT_CONTEXT_MAX_CHARS',
      DEFAULT_CONTEXT_MAX_CHARS,
    );
    const recent = await this.chatRepo.findRecentMessages(sessionId, limit);

    const kept: LlmMessage[] = [];
    let totalChars = 0;
    for (let i = recent.length - 1; i >= 0; i--) {
      const { role, content } = recent[i];
      totalChars += content.length;
      if (kept.length > 0 && totalChars > maxChars) {
        break;
      }
      kept.unshift({ role, content });
    }
    return kept;
  }
}
