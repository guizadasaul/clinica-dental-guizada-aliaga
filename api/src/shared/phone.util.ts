/**
 * Últimos `count` dígitos de un teléfono, para mostrar una pista ("terminado
 * en 665") sin exponer el número completo.
 */
export function phoneLastDigits(phone: string, count = 3): string {
  return phone.replace(/\D/g, '').slice(-count);
}

/** Normaliza un teléfono boliviano (con o sin prefijo 591) a E.164, ej. "+59171234567". */
export function toE164Bolivia(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  const normalized = digits.startsWith('591') ? digits : `591${digits}`;
  return `+${normalized}`;
}
