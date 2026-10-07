import { createHmac } from 'node:crypto';
import {
  ConflictException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import type { InboundWhatsappMessage } from '../domain/WhatsappInbound';
import { WhatsappSender, WhatsappSendError } from '../domain/WhatsappSender';
import type { WhatsappSender as IWhatsappSender } from '../domain/WhatsappSender';
import type { ChatLink } from '../domain/ChatLink';
import type { ChatAttachment } from '../domain/ChatAttachment';
import { ActorResolver } from './actor-resolver';
import type { ChannelSender } from './actor-resolver';
import {
  ChannelLinkingService,
  normalizeExternalNumber,
} from './channel-linking.service';
import { ChatService } from './chat.service';
import { fallbackReply } from './fallback-reply';

export interface ResolvedInboundMessage {
  message: InboundWhatsappMessage;
  /** E.164 del remitente. */
  number: string;
  sender: ChannelSender;
}

/** Respuestas fijas del canal (tuteo, igual que el agente). */
export const WHATSAPP_REPLIES = {
  nonText:
    'Por ahora solo puedo leer mensajes de texto. Cuéntame por escrito en qué te ayudo y con gusto te respondo.',
  linked:
    '¡Listo! Este número quedó vinculado a tu cuenta. Ya puedes preguntarme por tus citas, tus tratamientos y tu saldo.',
  linkFailed:
    'No pude vincular este número. Revisa el código en la web o pide uno nuevo (vence a los 10 minutos).',
  limit:
    'Por hoy alcanzaste el límite de mensajes. Escríbeme mañana y con gusto te ayudo.',
  busy: 'Todavía estoy respondiendo tu mensaje anterior. Escríbeme de nuevo cuando te llegue mi respuesta.',
  ambiguousHint:
    'Este número está registrado en más de una cuenta, así que te atiendo como visitante. Para consultar tus datos, pide un código de vinculación en la web de la clínica.',
} as const;

const TOO_MANY_REQUESTS: number = HttpStatus.TOO_MANY_REQUESTS;
/** "VINCULAR 123456" (el código lo valida ChannelLinkingService). */
const LINK_COMMAND = /^vincular\s+(\S+)$/i;
/** Ids de mensajes ya recibidos: Meta reintenta si no le llega el 200 a tiempo. */
const SEEN_MESSAGES_MAX = 1000;

function maskNumber(e164: string): string {
  return `•••• ${e164.slice(-4)}`;
}

/** WhatsApp no tiene botones como la web: los links van al final, como texto. */
function withLinks(reply: string, links: ChatLink[]): string {
  if (links.length === 0) return reply;
  return [reply, ...links.map((link) => `${link.label}: ${link.url}`)].join(
    '\n\n',
  );
}

interface WhatsappReply {
  text: string;
  attachments: ChatAttachment[];
}

function textOnly(text: string): WhatsappReply {
  return { text, attachments: [] };
}

/** WhatsApp no tiene los botones de la tarjeta web: se paga y se avisa por texto. */
function qrCaption(qr: ChatAttachment): string {
  return `QR de pago por Bs. ${qr.amountBob}. Vence en 30 minutos. Cuando pagues, escríbeme "ya pagué".`;
}

/**
 * Token de la conversación anónima de un número, derivado en el servidor
 * con el App Secret: estable por número (la conversación continúa entre
 * mensajes) e imposible de adivinar desde la web.
 */
function anonTokenFor(number: string): string {
  return createHmac('sha256', process.env['WHATSAPP_APP_SECRET'] ?? 'whatsapp')
    .update(`whatsapp:${number}`)
    .digest('base64url');
}

/**
 * Entrada de los mensajes de WhatsApp (CLI-101), separada del controller: el
 * webhook responde 200 enseguida y esto corre después. Identifica al
 * remitente (CLI-146), atiende el comando VINCULAR (CLI-100) y el resto lo
 * pasa al mismo agente de la web (ChatService, channel 'whatsapp'); acá no
 * hay lógica de agente ni de tools. WHATSAPP_ENABLED distinto de "true"
 * recibe y audita, pero no responde.
 *
 * Los ids vistos y la fila por número son en memoria, como el throttler y
 * el lock de ChatService: alcanza mientras la API corra en un solo proceso.
 */
@Injectable()
export class WhatsappInboundService {
  private readonly logger = new Logger(WhatsappInboundService.name);
  private readonly seen = new Set<string>();
  private readonly queues = new Map<string, Promise<unknown>>();

  constructor(
    private readonly actors: ActorResolver,
    private readonly chat: ChatService,
    private readonly linking: ChannelLinkingService,
    @Inject(WhatsappSender) private readonly sender: IWhatsappSender,
  ) {}

  /** No espera el procesamiento: el webhook tiene que contestarle rápido a Meta. */
  accept(messages: InboundWhatsappMessage[]): void {
    for (const message of messages) {
      if (this.alreadySeen(message.messageId)) continue;
      // En fila por número: dos mensajes seguidos del mismo chat no se cruzan.
      const previous = this.queues.get(message.from) ?? Promise.resolve();
      const next = previous
        .then(() => this.process(message))
        .catch((error: unknown) => {
          this.logger.error(
            `whatsapp.inbound falló id=${message.messageId}`,
            error,
          );
        });
      this.queues.set(message.from, next);
      void next.finally(() => {
        if (this.queues.get(message.from) === next) {
          this.queues.delete(message.from);
        }
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
    const resolved = { message, number, sender };
    if (process.env['WHATSAPP_ENABLED'] !== 'true') {
      return resolved;
    }

    const { text, attachments } = await this.replyFor(resolved);
    try {
      await this.sender.sendText(number, text);
      // El QR de pago va como imagen aparte, después del texto (CLI-236).
      for (const qr of attachments) {
        await this.sender.sendImage(number, qr.imageBase64, qrCaption(qr));
      }
    } catch (error) {
      if (!(error instanceof WhatsappSendError)) throw error;
      this.logger.warn(
        `whatsapp.send falló id=${message.messageId} status=${error.status ?? 'red'} code=${error.providerCode ?? '-'}`,
      );
    }
    return resolved;
  }

  private async replyFor({
    message,
    number,
    sender,
  }: ResolvedInboundMessage): Promise<WhatsappReply> {
    if (message.type !== 'text' || !message.text) {
      return textOnly(WHATSAPP_REPLIES.nonText);
    }
    const command = LINK_COMMAND.exec(message.text.trim());
    if (command) {
      const result = await this.linking.redeem('whatsapp', number, command[1]);
      return textOnly(
        result.status === 'linked'
          ? WHATSAPP_REPLIES.linked
          : WHATSAPP_REPLIES.linkFailed,
      );
    }

    try {
      const { actor } = sender;
      const result = await this.chat.handleMessage({
        actor,
        channel: 'whatsapp',
        text: message.text,
        requestId: message.messageId,
        ...(actor.kind === 'user'
          ? { resumeLatestSession: true }
          : { anonToken: anonTokenFor(number), serverIssuedAnonToken: true }),
      });
      const reply = withLinks(result.reply, result.links);
      return {
        text:
          sender.match === 'ambiguous'
            ? `${WHATSAPP_REPLIES.ambiguousHint}\n\n${reply}`
            : reply,
        attachments: result.attachments,
      };
    } catch (error) {
      return textOnly(this.replyForError(error));
    }
  }

  private replyForError(error: unknown): string {
    if (error instanceof ConflictException) return WHATSAPP_REPLIES.busy;
    if (
      error instanceof HttpException &&
      error.getStatus() === TOO_MANY_REQUESTS
    ) {
      return WHATSAPP_REPLIES.limit;
    }
    if (!(error instanceof HttpException)) {
      this.logger.error('whatsapp.inbound error del agente', error);
    }
    return fallbackReply('es');
  }

  private alreadySeen(messageId: string): boolean {
    if (this.seen.has(messageId)) return true;
    this.seen.add(messageId);
    if (this.seen.size > SEEN_MESSAGES_MAX) {
      // Set conserva el orden de inserción: el primero es el más viejo.
      const oldest = this.seen.values().next().value as string | undefined;
      if (oldest !== undefined) this.seen.delete(oldest);
    }
    return false;
  }
}
