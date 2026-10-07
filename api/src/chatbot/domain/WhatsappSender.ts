/**
 * Puerto de salida hacia WhatsApp (CLI-101). La aplicación no conoce la
 * Cloud API de Meta: cambiar de proveedor (ej. Twilio) es otro adaptador.
 */
export interface WhatsappSender {
  /** `to` en E.164 o solo dígitos con código de país. */
  sendText(to: string, text: string): Promise<void>;
  /** Una imagen PNG (el QR de pago, CLI-236) con un texto al pie. */
  sendImage(to: string, pngBase64: string, caption: string): Promise<void>;
}

export const WhatsappSender = Symbol('WhatsappSender');

/** El envío falló. Lleva solo el status y el código del proveedor, nunca el token ni el cuerpo. */
export class WhatsappSendError extends Error {
  constructor(
    readonly status: number | null,
    readonly providerCode: number | null,
  ) {
    super(
      `No se pudo enviar el mensaje de WhatsApp (status=${status ?? 'red'} code=${providerCode ?? '-'})`,
    );
    this.name = 'WhatsappSendError';
  }
}
