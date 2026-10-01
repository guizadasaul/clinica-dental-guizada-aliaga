import type { ChatLink } from '../domain/ChatLink';
import type { ChatLocale } from './fallback-reply';

const LINK_ONLY_REPLIES: Record<ChatLocale, string> = {
  es: 'Te dejo el link abajo.',
  en: 'Here is the link below.',
  pt: 'Deixo o link abaixo.',
};

/** Para cuando la respuesta del modelo era solo un link (que el backend saca del texto). */
export function linkOnlyReply(locale: ChatLocale = 'es'): string {
  return LINK_ONLY_REPLIES[locale] ?? LINK_ONLY_REPLIES.es;
}

/** Marca de un link de reserva escrito por el modelo, completo o recortado. */
const BOOKING_PATH = '/reservar';

function isLetter(char: string): boolean {
  return char >= 'a' && char <= 'z';
}

/**
 * true si la "palabra" parece una URL: con esquema, www., wa.me/, un link de
 * reserva (aunque venga recortado) o un dominio con ruta ("algo.com/x"). Un
 * email o una fecha "24/09/2026" no cuentan.
 */
function isUrlLike(word: string): boolean {
  const lower = word.toLowerCase();
  if (
    lower.includes(BOOKING_PATH) ||
    lower.includes('://') ||
    lower.startsWith('www.') ||
    lower.includes('wa.me/')
  ) {
    return true;
  }
  const slash = lower.indexOf('/');
  if (slash <= 0) return false;
  const host = lower.slice(0, slash);
  const dot = host.lastIndexOf('.');
  const tld = host.slice(dot + 1);
  return dot > 0 && tld.length >= 2 && [...tld].every(isLetter);
}

/**
 * Saca del texto toda URL (CLI-145). Los links válidos los agrega el backend
 * aparte (ChatLink); cualquier URL que escriba el modelo es inventada o puede
 * venir recortada ("doctorId=ac98..."), y por WhatsApp se leería como real.
 * Sin regex: se recorre por espacios, lineal en el largo del texto.
 */
export function removeUrls(text: string): string {
  return text
    .split('\n')
    .map((line) =>
      line
        .split(' ')
        .filter((word) => !isUrlLike(word))
        .join(' ')
        .trimEnd(),
    )
    .join('\n')
    .trim();
}

/** Une listas de links sin repetir URLs, en el orden en que llegaron. */
export function mergeLinks(target: ChatLink[], incoming: ChatLink[]): void {
  for (const link of incoming) {
    if (!target.some((existing) => existing.url === link.url)) {
      target.push(link);
    }
  }
}
