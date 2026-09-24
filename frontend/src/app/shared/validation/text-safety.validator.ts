// Espejo de api/src/shared/validators/text-safety.validator.ts — cambiar los
// dos juntos. Funciones puras, sin Angular.

/** Cualquier tag HTML: `<algo>`, `</algo>`, `<algo attr="x">`. */
export const HTML_RE = /<[^<>]*>/;

// Lista blanca de TLDs a propósito, no `\.[a-z]{2,}`: un texto legítimo como
// "excelente.Muy recomendable" (punto pegado a la siguiente palabra, sin
// espacio) NO tiene que dispararlo — "Muy" no es un TLD real. Cubre el link
// explícito (http(s)://... o www....) y el dominio pelado (spam.com).
export const URL_TLDS = 'com|net|org|io|co|xyz|ru|info|biz|shop|online|site|link';
const URL_RE = new RegExp(
  String.raw`(?:https?:\/\/|www\.)\S+|\b[a-z0-9-]+\.(?:${URL_TLDS})\b`,
  'iu',
);

/** true si el texto contiene algún tag HTML. */
export function hasHtml(value: string): boolean {
  return HTML_RE.test(value);
}

/** true si el texto contiene algún link (http(s)://, www. o dominio con TLD conocido). */
export function hasUrls(value: string): boolean {
  return URL_RE.test(value);
}

/** true si el texto tiene algún carácter repetido más de `max` veces seguidas
 * (ej. "aaaaaaaaaaaa"). */
export function hasCharSpam(value: string, max: number): boolean {
  const spamRe = new RegExp(String.raw`(.)\1{${max},}`, 'u');
  return spamRe.test(value);
}
