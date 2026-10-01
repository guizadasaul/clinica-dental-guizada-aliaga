import { CLINIC_WHATSAPP, DOCTOR_CONTACTS } from '../domain/ClinicContacts';
import { fallbackReply } from './fallback-reply';
import type { ChatLocale } from './fallback-reply';

describe('fallbackReply', () => {
  it.each(['es', 'en', 'pt'] as ChatLocale[])(
    'en %s deriva a los doctores y no al WhatsApp del propio bot',
    (locale) => {
      for (const doctor of DOCTOR_CONTACTS) {
        expect(fallbackReply(locale)).toContain(doctor.phone);
      }
      expect(fallbackReply(locale)).not.toContain(CLINIC_WHATSAPP);
    },
  );

  it('usa castellano por defecto', () => {
    expect(fallbackReply()).toBe(fallbackReply('es'));
  });

  it('usa castellano ante un idioma desconocido', () => {
    expect(fallbackReply('fr' as ChatLocale)).toBe(fallbackReply('es'));
  });

  it('los tres idiomas son distintos', () => {
    expect(
      new Set([fallbackReply('es'), fallbackReply('en'), fallbackReply('pt')])
        .size,
    ).toBe(3);
  });
});
