export type ChatLocale = 'es' | 'en' | 'pt';

/** POST /chat/messages. La identidad sale del token: el body nunca lleva rol ni ids de usuario. */
export interface ChatMessageRequest {
  message: string;
  sessionId?: string;
  locale?: ChatLocale;
}

/** POST /public/chat/messages. */
export interface PublicChatMessageRequest {
  message: string;
  sessionToken?: string;
  locale?: ChatLocale;
}
