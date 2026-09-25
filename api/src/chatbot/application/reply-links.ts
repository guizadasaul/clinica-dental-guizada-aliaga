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

/**
 * Saca del texto cualquier "palabra" que sea un link de reserva. Los links
 * los agrega el backend aparte (ChatLink); si el modelo igual escribe uno,
 * puede venir recortado ("doctorId=ac98..."), así que nunca se confía en él.
 * Sin regex: se recorre por espacios, lineal en el largo del texto.
 */
export function removeBookingUrls(text: string): string {
  return text
    .split('\n')
    .map((line) =>
      line
        .split(' ')
        .filter((word) => !word.includes(BOOKING_PATH))
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
