/** Heurística simple para distinguir un teléfono de un correo en el campo combinado de login. */
export function looksLikePhone(value: string): boolean {
  const trimmed = value.trim();
  return !trimmed.includes('@') && /^[0-9+\s-]{6,20}$/.test(trimmed);
}

/**
 * Normaliza un teléfono a E.164. Respeta un "+" explícito (cualquier país); sin
 * él, asume Bolivia — salvo que ya venga con el prefijo 591 pegado (compat con
 * cuentas ya creadas así). Verificado contra el único `users.phone` real cargado
 * en la base ("59177842665"): tipeando "77842665" sigue dando "+59177842665",
 * igual que antes de este cambio — cero regresión de login (ver phone.util.spec.ts).
 */
export function normalizePhone(value: string): string {
  const trimmed = value.trim();
  const digits = trimmed.replace(/\D/g, '');
  if (trimmed.startsWith('+')) return `+${digits}`;
  if (digits.startsWith('591')) return `+${digits}`; // compat: cuentas ya creadas
  return `+591${digits}`; // sin prefijo ⇒ Bolivia
}
