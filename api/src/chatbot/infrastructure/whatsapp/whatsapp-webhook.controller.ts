import { timingSafeEqual } from 'node:crypto';
import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { WhatsappInboundService } from '../../application/whatsapp-inbound.service.js';
import { WhatsappSignatureGuard } from './whatsapp-signature.guard.js';
import { parseWhatsappWebhook } from './whatsapp-webhook.parser.js';

function safeEquals(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/**
 * Webhook de la WhatsApp Cloud API de Meta (CLI-101). Sin SupabaseAuthGuard:
 * lo llama Meta, no un usuario. El GET lo usa Meta una vez para verificar la
 * URL; el POST trae los mensajes, firmados con el App Secret.
 *
 * Sin throttle: todos los requests llegan desde las IPs de Meta, y un 429 le
 * haría reintentar. El body no se valida con DTO (payload de terceros,
 * anidado): lo lee whatsapp-webhook.parser.
 */
@Controller('webhooks/whatsapp')
@SkipThrottle()
export class WhatsappWebhookController {
  constructor(private readonly inbound: WhatsappInboundService) {}

  @Get()
  @Header('Content-Type', 'text/plain')
  verify(@Query() query: Record<string, unknown>): string {
    const expected = process.env['WHATSAPP_VERIFY_TOKEN'];
    const token = query['hub.verify_token'];
    const challenge = query['hub.challenge'];
    if (
      !expected ||
      query['hub.mode'] !== 'subscribe' ||
      typeof token !== 'string' ||
      typeof challenge !== 'string' ||
      !safeEquals(token, expected)
    ) {
      throw new ForbiddenException();
    }
    return challenge;
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  @UseGuards(WhatsappSignatureGuard)
  receive(@Body() body: unknown): { received: number } {
    const parsed = parseWhatsappWebhook(body);
    if (!parsed) {
      throw new BadRequestException('Payload de WhatsApp inválido');
    }
    this.inbound.accept(parsed.messages);
    return { received: parsed.messages.length };
  }
}
