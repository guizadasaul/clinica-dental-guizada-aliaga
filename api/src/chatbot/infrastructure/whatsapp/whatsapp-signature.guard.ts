import { createHmac, timingSafeEqual } from 'node:crypto';
import {
  Injectable,
  Logger,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import type { Request } from 'express';

const SIGNATURE_HEADER = 'x-hub-signature-256';
const SIGNATURE_PREFIX = 'sha256=';

type RequestWithRawBody = Request & { rawBody?: Buffer };

/**
 * Autentica el webhook de Meta (CLI-101): `X-Hub-Signature-256` es
 * `sha256=` + HMAC-SHA256 del body crudo con el App Secret. Sin esto
 * cualquiera podría mandar un mensaje "desde" el número de un paciente.
 * Necesita `rawBody: true` en NestFactory.create (main.ts): el JSON ya
 * parseado no sirve, porque cualquier cambio de espacios cambia la firma.
 *
 * Sin WHATSAPP_APP_SECRET configurado rechaza cualquier POST: es preferible perder
 * mensajes a aceptar uno sin verificar. Siempre 401 sin detalle.
 */
@Injectable()
export class WhatsappSignatureGuard implements CanActivate {
  private readonly logger = new Logger(WhatsappSignatureGuard.name);

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<RequestWithRawBody>();
    const secret = process.env['WHATSAPP_APP_SECRET'];
    if (!secret) {
      this.logger.error('WHATSAPP_APP_SECRET no está configurada');
      throw new UnauthorizedException();
    }

    const header = request.headers[SIGNATURE_HEADER];
    const rawBody = request.rawBody;
    if (
      typeof header !== 'string' ||
      !header.startsWith(SIGNATURE_PREFIX) ||
      !rawBody
    ) {
      throw new UnauthorizedException();
    }

    const expected = createHmac('sha256', secret).update(rawBody).digest();
    const received = Buffer.from(header.slice(SIGNATURE_PREFIX.length), 'hex');
    if (
      received.length !== expected.length ||
      !timingSafeEqual(received, expected)
    ) {
      this.logger.warn('whatsapp.webhook firma inválida');
      throw new UnauthorizedException();
    }
    return true;
  }
}
