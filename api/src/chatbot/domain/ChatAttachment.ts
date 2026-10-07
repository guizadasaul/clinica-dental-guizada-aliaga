/**
 * Un adjunto que acompaña la respuesta del asistente (CLI-236). Igual que un
 * ChatLink, lo produce una tool y va directo a la respuesta, sin pasar por el
 * modelo: el LLM nunca ve la imagen del QR ni el id del cobro, solo el monto
 * y lo que cubre. La web lo muestra como tarjeta con "Ya pagué" y "Anular";
 * WhatsApp manda la imagen.
 */
export interface QrPaymentAttachment {
  type: 'qr_payment';
  /** Id del cobro: la web lo usa para verificar o anular desde la tarjeta. */
  chargeId: string;
  amountBob: number;
  /** PNG en base64, tal como lo devuelve BANECO. */
  imageBase64: string;
  /** Qué tratamientos cubre, para mostrarlo en la tarjeta. */
  lines: { treatment: string; amountBob: number }[];
}

export type ChatAttachment = QrPaymentAttachment;

/** Sin repetidos: si el modelo pide el mismo QR dos veces, va una sola tarjeta. */
export function mergeAttachments(
  target: ChatAttachment[],
  incoming: ChatAttachment[],
): void {
  for (const attachment of incoming) {
    if (!target.some((a) => a.chargeId === attachment.chargeId)) {
      target.push(attachment);
    }
  }
}
