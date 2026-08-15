/** Heurística simple para distinguir un teléfono de un correo en el campo combinado de login. */
export function looksLikePhone(value: string): boolean {
  const trimmed = value.trim();
  return !trimmed.includes('@') && /^[0-9+\s-]{6,20}$/.test(trimmed);
}

/** Normaliza un teléfono boliviano (con o sin prefijo 591) a E.164, ej. "+59171234567". */
export function normalizePhone(value: string): string {
  const digits = value.replace(/\D/g, '');
  const normalized = digits.startsWith('591') ? digits : `591${digits}`;
  return `+${normalized}`;
}
