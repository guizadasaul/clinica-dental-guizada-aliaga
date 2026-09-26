import type { InboundWhatsappMessage } from '../../domain/WhatsappInbound.js';

/**
 * Lectura del payload de la WhatsApp Cloud API (CLI-101). Se parsea a mano,
 * sin DTO de class-validator: la estructura es anidada y Meta puede sumar
 * campos. Lo que no es un mensaje entrante (statuses de entregado o
 * leído, otros fields) se ignora sin error.
 *
 * Forma: { object: 'whatsapp_business_account', entry: [{ changes: [{
 *   field: 'messages', value: { messages?: [...], statuses?: [...] } }] }] }
 */
export interface ParsedWhatsappWebhook {
  messages: InboundWhatsappMessage[];
  /** Eventos que no son mensajes (statuses, otros fields): se ignoran. */
  ignoredEvents: number;
}

const WHATSAPP_OBJECT = 'whatsapp_business_account';
const MAX_TEXT_CHARS = 4096;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function toMessage(raw: unknown): InboundWhatsappMessage | null {
  if (!isRecord(raw)) return null;
  const { id, from, timestamp, type } = raw;
  if (
    typeof id !== 'string' ||
    typeof from !== 'string' ||
    typeof type !== 'string'
  ) {
    return null;
  }
  // Meta manda el timestamp en segundos, como string.
  const seconds = Number(timestamp);
  const text =
    type === 'text' &&
    isRecord(raw['text']) &&
    typeof raw['text']['body'] === 'string'
      ? raw['text']['body'].slice(0, MAX_TEXT_CHARS)
      : null;
  return {
    messageId: id,
    from,
    timestamp: Number.isFinite(seconds) ? new Date(seconds * 1000) : new Date(),
    type,
    text,
  };
}

/** Mensajes de un `change`; lo demás (statuses, otros fields) cuenta como ignorado. */
function readChange(change: unknown, into: ParsedWhatsappWebhook): void {
  const value = isRecord(change) ? change['value'] : null;
  if (!isRecord(change) || change['field'] !== 'messages' || !isRecord(value)) {
    into.ignoredEvents++;
    return;
  }
  into.ignoredEvents += asArray(value['statuses']).length;
  for (const raw of asArray(value['messages'])) {
    const message = toMessage(raw);
    if (message) {
      into.messages.push(message);
    } else {
      into.ignoredEvents++;
    }
  }
}

/** null si el payload no es un webhook de WhatsApp Business (→ 400). */
export function parseWhatsappWebhook(
  body: unknown,
): ParsedWhatsappWebhook | null {
  if (!isRecord(body) || body['object'] !== WHATSAPP_OBJECT) return null;
  if (!Array.isArray(body['entry'])) return null;

  const parsed: ParsedWhatsappWebhook = { messages: [], ignoredEvents: 0 };
  for (const entry of body['entry']) {
    for (const change of asArray(isRecord(entry) ? entry['changes'] : null)) {
      readChange(change, parsed);
    }
  }
  return parsed;
}
