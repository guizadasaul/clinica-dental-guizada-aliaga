import {
  Body,
  Controller,
  Delete,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { SupabaseAuthGuard } from '../../../auth/infrastructure/SupabaseAuthGuard.js';
import { RolesGuard } from '../../../auth/infrastructure/RolesGuard.js';
import { Roles } from '../../../auth/infrastructure/roles.decorator.js';
import { CurrentAppUser } from '../../../auth/infrastructure/CurrentAppUserDecorator.js';
import { UserRole } from '../../../auth/domain/value-objects/UserRole.js';
import type { User } from '../../../auth/domain/User.js';
import { readEnvInt } from '../../../shared/env.util.js';
import { ChatService } from '../../application/chat.service.js';
import { ActorResolver } from '../../application/actor-resolver.js';
import { ChatChannel } from '../../domain/ChatChannel.js';
import { chatAuditContext } from '../../domain/ChatAudit.js';
import type { ChatLink } from '../../domain/ChatLink.js';
import { SendChatMessageDto } from './dto/send-chat-message.dto.js';
import { resolveRequestId } from './request-id.js';

const MINUTE_MS = 60_000;

export interface ChatMessageResponse {
  sessionId: string;
  reply: string;
  links: ChatLink[];
}

/**
 * Chat web de un usuario autenticado (CLI-89). La identidad es la de
 * siempre: token de Supabase (SupabaseAuthGuard) + fila `users` con su rol
 * (RolesGuard). Nada del body define quién es el usuario.
 */
@Controller('chat')
@UseGuards(SupabaseAuthGuard, RolesGuard)
@Roles(UserRole.PATIENT, UserRole.ODONTOLOGIST, UserRole.ADMIN)
export class ChatController {
  constructor(
    private readonly chatService: ChatService,
    private readonly actorResolver: ActorResolver,
  ) {}

  @Post('messages')
  @HttpCode(HttpStatus.OK)
  @Throttle({
    default: {
      limit: () => readEnvInt('THROTTLE_CHAT_USER_PER_MINUTE', 10),
      ttl: MINUTE_MS,
    },
  })
  async sendMessage(
    @CurrentAppUser() appUser: User,
    @Body() dto: SendChatMessageDto,
    @Headers('x-request-id') requestIdHeader?: string,
  ): Promise<ChatMessageResponse> {
    const actor = await this.actorResolver.fromAppUser(appUser);
    const result = await this.chatService.handleMessage({
      actor,
      channel: ChatChannel.WEB,
      sessionId: dto.sessionId,
      text: dto.message,
      locale: dto.locale,
      requestId: resolveRequestId(requestIdHeader),
    });
    return {
      sessionId: result.sessionId,
      reply: result.reply,
      links: result.links,
    };
  }

  @Delete('sessions/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteSession(
    @CurrentAppUser() appUser: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('x-request-id') requestIdHeader?: string,
  ): Promise<void> {
    const actor = {
      kind: 'user' as const,
      userId: appUser.id,
      role: appUser.role,
      patientId: null,
    };
    await this.chatService.deleteSession(
      appUser.id,
      id,
      chatAuditContext(resolveRequestId(requestIdHeader), actor, null),
    );
  }

  @Delete('sessions')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteAllSessions(@CurrentAppUser() appUser: User): Promise<void> {
    await this.chatService.deleteAllSessions(appUser.id);
  }
}
