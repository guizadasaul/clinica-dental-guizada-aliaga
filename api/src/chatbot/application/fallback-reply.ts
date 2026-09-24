export type ChatLocale = 'es' | 'en' | 'pt';

/** WhatsApp de la clínica — el mismo de la landing (frontend landing.html). */
export const CLINIC_WHATSAPP = '+591 577 44250';

const FALLBACK_REPLIES: Record<ChatLocale, string> = {
  es: `En este momento no puedo responder. Intenta de nuevo en unos minutos o escríbenos al WhatsApp de la clínica: ${CLINIC_WHATSAPP}.`,
  en: `I can't answer right now. Please try again in a few minutes or message the clinic on WhatsApp: ${CLINIC_WHATSAPP}.`,
  pt: `No momento não consigo responder. Tente novamente em alguns minutos ou fale com a clínica pelo WhatsApp: ${CLINIC_WHATSAPP}.`,
};

/**
 * Respuesta fija cuando el LLM falla o no devuelve nada. Nunca incluye el
 * motivo técnico: el detalle queda solo en el log y en chat_messages.error_code.
 */
export function fallbackReply(locale: ChatLocale = 'es'): string {
  return FALLBACK_REPLIES[locale] ?? FALLBACK_REPLIES.es;
}
