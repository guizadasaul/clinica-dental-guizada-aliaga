/** Normaliza un teléfono boliviano (con o sin prefijo 591) a E.164, ej. "+59171234567". */
export function toE164Bolivia(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  const normalized = digits.startsWith('591') ? digits : `591${digits}`;
  return `+${normalized}`;
}
