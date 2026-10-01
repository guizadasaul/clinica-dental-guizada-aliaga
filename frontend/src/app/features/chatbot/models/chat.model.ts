/** Link que acompaña una respuesta (ej. el de reserva). Lo arma el backend, nunca el modelo. */
export interface ChatLink {
  label: string;
  url: string;
}

/** POST /chat/messages (usuario autenticado). */
export interface ChatMessageResponse {
  sessionId: string;
  reply: string;
  links: ChatLink[];
}

/** POST /public/chat/messages (visitante sin sesión). */
export interface PublicChatMessageResponse {
  sessionToken: string;
  reply: string;
  links: ChatLink[];
}
