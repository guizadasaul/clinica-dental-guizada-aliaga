import { Injectable } from '@nestjs/common';
import type { WhatsappSender } from '../../domain/WhatsappSender.js';
import { WhatsappSendError } from '../../domain/WhatsappSender.js';
import { readEnvInt } from '../../../shared/env.util.js';

const DEFAULT_API_VERSION = 'v23.0';
const DEFAULT_TIMEOUT_MS = 10_000;
/** Límite de WhatsApp para el cuerpo de un mensaje de texto. */
export const WHATSAPP_TEXT_MAX_CHARS = 4096;

function providerCode(body: unknown): number | null {
  if (typeof body !== 'object' || body === null) return null;
  const error = (body as { error?: { code?: unknown } }).error;
  return typeof error?.code === 'number' ? error.code : null;
}

/**
 * Envío por la WhatsApp Cloud API de Meta (CLI-101), con `fetch` como BANECO
 * y Resend. La configuración se lee en cada envío (env lazy): sin token ni
 * Phone Number ID la app arranca igual y solo falla el envío. El token nunca
 * se loguea ni viaja en un error.
 */
@Injectable()
export class WhatsappCloudClient implements WhatsappSender {
  async sendText(to: string, text: string): Promise<void> {
    const token = process.env['WHATSAPP_TOKEN'];
    const phoneNumberId = process.env['WHATSAPP_PHONE_NUMBER_ID'];
    if (!token || !phoneNumberId) {
      throw new WhatsappSendError(null, null);
    }
    const version = process.env['WHATSAPP_API_VERSION'] || DEFAULT_API_VERSION;
    const timeoutMs = readEnvInt('WHATSAPP_TIMEOUT_MS', DEFAULT_TIMEOUT_MS);

    let response: Response;
    try {
      response = await fetch(
        `https://graph.facebook.com/${version}/${phoneNumberId}/messages`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: to.replace(/\D/g, ''),
            type: 'text',
            // Sin vista previa: los links los arma el backend y no hace falta.
            text: {
              preview_url: false,
              body: text.slice(0, WHATSAPP_TEXT_MAX_CHARS),
            },
          }),
          signal: AbortSignal.timeout(timeoutMs),
        },
      );
    } catch {
      throw new WhatsappSendError(null, null);
    }
    if (!response.ok) {
      const body: unknown = await response.json().catch(() => null);
      throw new WhatsappSendError(response.status, providerCode(body));
    }
  }
}
