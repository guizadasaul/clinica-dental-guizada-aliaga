/** Link que acompaña una respuesta (ej. el de reserva). Lo arma el backend, nunca el modelo. */
export interface ChatLink {
  label: string;
  url: string;
}

/**
 * QR de pago que generó el asistente para el paciente (CLI-236). Lo arma el
 * backend, nunca el modelo: la imagen y el chargeId no pasan por el LLM.
 */
export interface ChatQrPayment {
  type: 'qr_payment';
  chargeId: string;
  amountBob: number;
  /** PNG en base64. */
  imageBase64: string;
  lines: { treatment: string; amountBob: number }[];
}

export type ChatAttachment = ChatQrPayment;

/** POST /chat/messages (usuario autenticado). */
export interface ChatMessageResponse {
  sessionId: string;
  reply: string;
  links: ChatLink[];
  /** Solo el chat autenticado los manda; puede faltar en respuestas viejas. */
  attachments?: ChatAttachment[];
}

/** POST /public/chat/messages (visitante sin sesión). */
export interface PublicChatMessageResponse {
  sessionToken: string;
  reply: string;
  links: ChatLink[];
}
