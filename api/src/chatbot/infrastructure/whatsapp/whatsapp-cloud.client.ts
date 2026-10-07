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

interface WhatsappConfig {
  token: string;
  baseUrl: string;
  timeoutMs: number;
}

/** Límite de WhatsApp para el texto al pie de una imagen. */
const WHATSAPP_CAPTION_MAX_CHARS = 1024;

/**
 * Envío por la WhatsApp Cloud API de Meta (CLI-101), con `fetch` como BANECO
 * y Resend. La configuración se lee en cada envío (env lazy): sin token ni
 * Phone Number ID la app arranca igual y solo falla el envío. El token nunca
 * se loguea ni viaja en un error.
 */
@Injectable()
export class WhatsappCloudClient implements WhatsappSender {
  async sendText(to: string, text: string): Promise<void> {
    const config = this.config();
    await this.post(config, '/messages', {
      json: {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: to.replace(/\D/g, ''),
        type: 'text',
        // Sin vista previa: los links los arma el backend y no hace falta.
        text: {
          preview_url: false,
          body: text.slice(0, WHATSAPP_TEXT_MAX_CHARS),
        },
      },
    });
  }

  /**
   * El QR de pago (CLI-236). La Cloud API no acepta la imagen en el mensaje:
   * primero se sube a /media y después se manda el mensaje con su id.
   */
  async sendImage(
    to: string,
    pngBase64: string,
    caption: string,
  ): Promise<void> {
    const config = this.config();
    const form = new FormData();
    form.append('messaging_product', 'whatsapp');
    form.append('type', 'image/png');
    form.append(
      'file',
      new Blob([Buffer.from(pngBase64, 'base64')], { type: 'image/png' }),
      'qr.png',
    );
    const uploaded = await this.post(config, '/media', { form });
    const mediaId = (uploaded as { id?: unknown } | null)?.id;
    if (typeof mediaId !== 'string') {
      throw new WhatsappSendError(null, null);
    }
    await this.post(config, '/messages', {
      json: {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: to.replace(/\D/g, ''),
        type: 'image',
        image: {
          id: mediaId,
          caption: caption.slice(0, WHATSAPP_CAPTION_MAX_CHARS),
        },
      },
    });
  }

  private config(): WhatsappConfig {
    const token = process.env['WHATSAPP_TOKEN'];
    const phoneNumberId = process.env['WHATSAPP_PHONE_NUMBER_ID'];
    if (!token || !phoneNumberId) {
      throw new WhatsappSendError(null, null);
    }
    const version = process.env['WHATSAPP_API_VERSION'] || DEFAULT_API_VERSION;
    return {
      token,
      baseUrl: `https://graph.facebook.com/${version}/${phoneNumberId}`,
      timeoutMs: readEnvInt('WHATSAPP_TIMEOUT_MS', DEFAULT_TIMEOUT_MS),
    };
  }

  /** POST a la Cloud API; devuelve el cuerpo JSON de la respuesta, o null. */
  private async post(
    config: WhatsappConfig,
    path: string,
    body: { json: unknown } | { form: FormData },
  ): Promise<unknown> {
    let response: Response;
    try {
      response = await fetch(`${config.baseUrl}${path}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.token}`,
          // Con FormData, fetch arma el Content-Type con su boundary.
          ...('json' in body && { 'Content-Type': 'application/json' }),
        },
        body: 'json' in body ? JSON.stringify(body.json) : body.form,
        signal: AbortSignal.timeout(config.timeoutMs),
      });
    } catch {
      throw new WhatsappSendError(null, null);
    }
    const parsed: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      throw new WhatsappSendError(response.status, providerCode(parsed));
    }
    return parsed;
  }
}
