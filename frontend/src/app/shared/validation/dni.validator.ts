// Espejo de api/src/shared/validators/dni.validator.ts — cambiar los dos
// juntos. Número de documento (CI, NIT o pasaporte), CLI-177: 5 a 12
// caracteres, solo letras en mayúscula, números y guiones medios, empezando y
// terminando en letra o número. Sin espacios ni puntos: se rechazan, no se
// borran en silencio. La extensión de la CI va dentro, con guion (1234567-LP).
// Funciones puras, sin Angular.

export const DNI_MAX_LENGTH = 12;
export const DNI_RE = /^[A-Z0-9][A-Z0-9-]{3,10}[A-Z0-9]$/;

/**
 * Normaliza un número de documento para guardarlo siempre igual: recorta los
 * bordes y pasa a mayúsculas. No quita nada del medio: lo que no está
 * permitido lo rechaza la validación.
 */
export function normalizeDni(value: string): string {
  return value.trim().toUpperCase();
}

/** Número de documento (ya normalizado internamente) contra `DNI_RE`. */
export function isValidDni(value: string): boolean {
  return DNI_RE.test(normalizeDni(value));
}

const DOCUMENT_NAMES: Record<string, string> = {
  ci: 'El número de CI',
  nit: 'El número de NIT',
  pasaporte: 'El número de pasaporte',
};

/** "El número de CI" / "de NIT" / "de pasaporte" según el tipo elegido; "El número de documento" si no hay. */
export function documentNumberLabel(documentType: string | null | undefined): string {
  return (documentType && DOCUMENT_NAMES[documentType]) || 'El número de documento';
}

/** Mensaje de formato inválido, nombrando el tipo de documento (nunca "DNI"). */
export function dniFormatMessage(documentType: string | null | undefined): string {
  const base = `${documentNumberLabel(documentType)} solo puede tener letras, números y guiones, sin espacios ni puntos (5 a ${DNI_MAX_LENGTH} caracteres).`;
  return documentType === 'ci' ? `${base} La extensión va con guion, por ejemplo 1234567-LP.` : base;
}
