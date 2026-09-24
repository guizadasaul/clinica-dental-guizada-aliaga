/**
 * Canal por el que llega un mensaje al chatbot. El agente (ChatService) es
 * el mismo para los dos: el canal solo resuelve identidad y transporte.
 */
export const ChatChannel = {
  WEB: 'web',
  WHATSAPP: 'whatsapp',
} as const;
export type ChatChannel = (typeof ChatChannel)[keyof typeof ChatChannel];
