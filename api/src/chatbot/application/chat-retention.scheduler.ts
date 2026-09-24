import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ChatRepository } from '../domain/ChatRepository';
import type { ChatRepository as IChatRepository } from '../domain/ChatRepository';
import { readEnvInt } from '../../shared/env.util';

const DAY_MS = 24 * 60 * 60 * 1000;
export const DEFAULT_CHAT_RETENTION_DAYS = 30;

/**
 * Retención de conversaciones (CLI-84): una vez por día borra las sesiones
 * sin actividad hace más de CHAT_RETENTION_DAYS (default 30). Los mensajes
 * caen por ON DELETE CASCADE. ScheduleModule.forRoot() ya está registrado en
 * PaymentsModule y descubre los @Cron de toda la app.
 */
@Injectable()
export class ChatRetentionScheduler {
  private readonly logger = new Logger(ChatRetentionScheduler.name);

  constructor(
    @Inject(ChatRepository) private readonly chatRepo: IChatRepository,
  ) {}

  @Cron('0 30 3 * * *', { timeZone: 'America/La_Paz' })
  async purgeExpired(now: Date = new Date()): Promise<number> {
    const days = readEnvInt('CHAT_RETENTION_DAYS', DEFAULT_CHAT_RETENTION_DAYS);
    const cutoff = new Date(now.getTime() - days * DAY_MS);
    const deleted = await this.chatRepo.deleteInactiveSince(cutoff);
    if (deleted > 0) {
      this.logger.log(
        `Retención del chatbot: ${deleted} conversación(es) borrada(s)`,
      );
    }
    return deleted;
  }
}
