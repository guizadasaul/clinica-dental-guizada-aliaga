import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { readEnvInt } from '../../../shared/env.util.js';
import { ChatService } from '../../application/chat.service.js';
import { ActorResolver } from '../../application/actor-resolver.js';
import { ChatChannel } from '../../domain/ChatChannel.js';
import type { ChatLink } from '../../domain/ChatLink.js';
import { SendPublicChatMessageDto } from './dto/send-chat-message.dto.js';

const HOUR_MS = 60 * 60_000;

export interface PublicChatMessageResponse {
  sessionToken: string;
  reply: string;
  links: ChatLink[];
}

/**
 * Chat del visitante sin sesión (landing, CLI-89). Sin guard, igual que el
 * resto de /public: el actor es siempre anónimo y solo ve tools públicas.
 * Rate limit por IP + cuota diaria por conversación (ChatService).
 */
@Controller('public/chat')
export class PublicChatController {
  constructor(
    private readonly chatService: ChatService,
    private readonly actorResolver: ActorResolver,
  ) {}

  @Post('messages')
  @HttpCode(HttpStatus.OK)
  @Throttle({
    default: {
      limit: () => readEnvInt('THROTTLE_CHAT_PUBLIC_PER_HOUR', 30),
      ttl: HOUR_MS,
    },
  })
  async sendMessage(
    @Body() dto: SendPublicChatMessageDto,
  ): Promise<PublicChatMessageResponse> {
    const result = await this.chatService.handleMessage({
      actor: this.actorResolver.anonymous(),
      channel: ChatChannel.WEB,
      anonToken: dto.sessionToken,
      text: dto.message,
      locale: dto.locale,
    });
    // Para un anónimo ChatService siempre devuelve el token (nuevo o el mismo).
    return {
      sessionToken: result.anonToken ?? '',
      reply: result.reply,
      links: result.links,
    };
  }
}
