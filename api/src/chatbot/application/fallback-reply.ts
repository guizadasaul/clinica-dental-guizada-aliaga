import { doctorContactsText } from '../domain/ClinicContacts';

export type ChatLocale = 'es' | 'en' | 'pt';

// El WhatsApp de la clínica es el mismo bot, así que cuando el bot falla se
// deriva a los doctores (en horario de atención).
const FALLBACK_REPLIES: Record<ChatLocale, string> = {
  es: `En este momento no puedo responder. Intenta de nuevo en unos minutos o, en horario de atención, escribe a ${doctorContactsText()}.`,
  en: `I can't answer right now. Please try again in a few minutes or, during office hours, message ${doctorContactsText()}.`,
  pt: `No momento não consigo responder. Tente novamente em alguns minutos ou, no horário de atendimento, escreva para ${doctorContactsText()}.`,
};

/**
 * Respuesta fija cuando el LLM falla o no devuelve nada. Nunca incluye el
 * motivo técnico: el detalle queda solo en el log y en chat_messages.error_code.
 */
export function fallbackReply(locale: ChatLocale = 'es'): string {
  return FALLBACK_REPLIES[locale] ?? FALLBACK_REPLIES.es;
}
