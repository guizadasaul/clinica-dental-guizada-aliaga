import type { ChatLink } from '../domain/ChatLink';
import type { ChatLocale } from './fallback-reply';
import { linkOnlyReply, mergeLinks, removeBookingUrls } from './reply-links';

describe('reply-links', () => {
  describe('removeBookingUrls', () => {
    it('saca links de reserva completos o recortados y deja el resto del texto', () => {
      expect(
        removeBookingUrls(
          'Reserva acá: https://guizadaaliaga.com/reservar?slot=x&doctorId=ab12...\nTe esperamos.',
        ),
      ).toBe('Reserva acá:\nTe esperamos.');
    });

    it('saca también un link sin protocolo', () => {
      expect(
        removeBookingUrls('Link: localhost:4200/reservar?slot=1 listo'),
      ).toBe('Link: listo');
    });

    it('no toca un texto sin links de reserva', () => {
      expect(removeBookingUrls('Atendemos de lunes a sábado.')).toBe(
        'Atendemos de lunes a sábado.',
      );
    });

    it('devuelve vacío si el texto era solo el link', () => {
      expect(
        removeBookingUrls('  http://localhost:4200/reservar?slot=1  '),
      ).toBe('');
    });
  });

  describe('mergeLinks', () => {
    it('agrega sin repetir URLs, en orden', () => {
      const target: ChatLink[] = [{ label: 'A', url: 'u1' }];

      mergeLinks(target, [
        { label: 'A otra vez', url: 'u1' },
        { label: 'B', url: 'u2' },
      ]);

      expect(target).toEqual([
        { label: 'A', url: 'u1' },
        { label: 'B', url: 'u2' },
      ]);
    });
  });

  describe('linkOnlyReply', () => {
    it('usa castellano por defecto y ante un idioma desconocido', () => {
      expect(linkOnlyReply()).toBe('Te dejo el link abajo.');
      expect(linkOnlyReply('fr' as ChatLocale)).toBe('Te dejo el link abajo.');
      expect(linkOnlyReply('pt')).toBe('Deixo o link abaixo.');
    });
  });
});
