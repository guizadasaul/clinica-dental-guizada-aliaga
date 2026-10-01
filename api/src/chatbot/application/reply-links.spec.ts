import type { ChatLink } from '../domain/ChatLink';
import type { ChatLocale } from './fallback-reply';
import { linkOnlyReply, mergeLinks, removeUrls } from './reply-links';

describe('reply-links', () => {
  describe('removeUrls', () => {
    it('saca links de reserva completos o recortados y deja el resto del texto', () => {
      expect(
        removeUrls(
          'Reserva acá: https://guizadaaliaga.com/reservar?slot=x&doctorId=ab12...\nTe esperamos.',
        ),
      ).toBe('Reserva acá:\nTe esperamos.');
    });

    it('saca también un link sin protocolo', () => {
      expect(removeUrls('Link: localhost:4200/reservar?slot=1 listo')).toBe(
        'Link: listo',
      );
    });

    it('no toca un texto sin links de reserva', () => {
      expect(removeUrls('Atendemos de lunes a sábado.')).toBe(
        'Atendemos de lunes a sábado.',
      );
    });

    it('devuelve vacío si el texto era solo el link', () => {
      expect(removeUrls('  http://localhost:4200/reservar?slot=1  ')).toBe('');
    });
  });

  describe('removeUrls: cualquier URL inventada (CLI-145)', () => {
    it.each([
      'https://clinicadentalguizadaaliaga.com/booking?token=generated_link_12345',
      'www.clinica.com',
      'clinica-dental.bo/turnos',
      'wa.me/59157744250',
      '(https://ejemplo.com/x)',
    ])('saca %s', (url) => {
      expect(removeUrls(`Reservá acá: ${url} gracias`)).toBe(
        'Reservá acá: gracias',
      );
    });

    it('no toca emails, fechas ni montos', () => {
      const text =
        'Escribí a clinicadentalguizadaaliaga@gmail.com. Pagado el 24/09/2026: 1/2 del total, Bs. 1.500.';
      expect(removeUrls(text)).toBe(text);
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
