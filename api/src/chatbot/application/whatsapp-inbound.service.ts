import { Injectable, Logger } from '@nestjs/common';
import type { InboundWhatsappMessage } from '../domain/WhatsappInbound';
import { ActorResolver } from './actor-resolver';
import type { ChannelSender } from './actor-resolver';
import { normalizeExternalNumber } from './channel-linking.service';

export interface ResolvedInboundMessage {
  message: InboundWhatsappMessage;
  /** E.164 del remitente. */
  number: string;
  sender: ChannelSender;
}

function maskNumber(e164: string): string {
  return `•••• ${e164.slice(-4)}`;
}

/**
 * Entrada de los mensajes de WhatsApp (CLI-101), separada del controller: el
 * webhook responde 200 enseguida y esto corre después, sin bloquear a Meta.
 *
 * Hoy recibe, identifica al remitente (CLI-146: vínculo por código, doctor,
 * paciente o visitante) y deja un evento de auditoría. El paso siguiente de
 * CLI-101 es pasar `resolved` a ChatService.handleMessage (el mismo agente
 * de la web, con channel 'whatsapp') y responder por la Cloud API: no se
 * duplica ninguna lógica del agente acá.
 */
@Injectable()
export class WhatsappInboundService {
  private readonly logger = new Logger(WhatsappInboundService.name);

  constructor(private readonly actors: ActorResolver) {}

  /** No espera el procesamiento: el webhook tiene que contestarle rápido a Meta. */
  accept(messages: InboundWhatsappMessage[]): void {
    for (const message of messages) {
      void this.process(message).catch((error: unknown) => {
        this.logger.error(
          `whatsapp.inbound falló id=${message.messageId}`,
          error,
        );
      });
    }
  }

  async process(
    message: InboundWhatsappMessage,
  ): Promise<ResolvedInboundMessage | null> {
    const number = normalizeExternalNumber(message.from);
    if (!number) {
      this.logger.warn(
        `whatsapp.inbound número inválido id=${message.messageId}`,
      );
      return null;
    }
    const sender = await this.actors.fromChannelSender('whatsapp', number);
    // Sin el texto del mensaje ni el número completo (mismo criterio que
    // chat.turn, CLI-98).
    this.logger.log(
      JSON.stringify({
        event: 'whatsapp.inbound',
        messageId: message.messageId,
        from: maskNumber(number),
        type: message.type,
        match: sender.match,
        role: sender.actor.kind === 'user' ? sender.actor.role : 'anonymous',
        ts: message.timestamp.toISOString(),
      }),
    );
    return { message, number, sender };
  }
}
