/**
 * Un mensaje entrante de WhatsApp ya extraído del webhook de Meta (CLI-101),
 * sin tipos del proveedor: es lo que recibe la capa de aplicación.
 */
export interface InboundWhatsappMessage {
  /** id de WhatsApp (wamid…), para idempotencia. */
  messageId: string;
  /** Número del remitente tal como lo manda Meta (solo dígitos, con código de país). */
  from: string;
  timestamp: Date;
  /** text, image, audio, interactive, … */
  type: string;
  /** Solo para type === 'text'. */
  text: string | null;
}
