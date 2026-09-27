/**
 * Métodos de pago controlados (CLI-159). Antes era texto libre: los pagos
 * viejos conservan lo que se cargó ("efectivo", "qr", etc.) y se muestran tal
 * cual; los nuevos solo usan estos valores.
 */
export const PaymentMethod = {
  CASH: 'cash',
  QR_BANECO: 'qr_baneco',
} as const;
export type PaymentMethod = (typeof PaymentMethod)[keyof typeof PaymentMethod];
