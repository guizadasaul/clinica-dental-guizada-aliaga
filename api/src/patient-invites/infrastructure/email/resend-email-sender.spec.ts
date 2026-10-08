import { ServiceUnavailableException } from '@nestjs/common';
import { ResendEmailSender } from './resend-email-sender';

interface SentEmail {
  subject: string;
  html: string;
  text: string;
  to: string;
}

describe('ResendEmailSender', () => {
  const sender = new ResendEmailSender();
  const fetchMock = jest.fn();
  const ORIGINAL_ENV = { ...process.env };

  beforeEach(() => {
    jest.clearAllMocks();
    process.env['RESEND_API_KEY'] = 'test-key';
    process.env['RESEND_FROM_EMAIL'] = 'no-reply@example.com';
    fetchMock.mockResolvedValue({ ok: true });
    global.fetch = fetchMock;
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  async function sentEmail(kind: 'patient' | 'doctor'): Promise<SentEmail> {
    await sender.sendInviteEmail({
      to: 'destino@example.com',
      displayName: 'Nombre',
      inviteUrl: 'https://app.example.com/invitacion/tok',
      kind,
    });
    const [, init] = fetchMock.mock.calls[0] as [string, { body: string }];
    return JSON.parse(init.body) as SentEmail;
  }

  // CLI-77: el vencimiento depende de a quién va dirigida la invitación.
  it('tells a patient the link expires in 24 hours, in both the html and the plain-text part (CLI-255)', async () => {
    const email = await sentEmail('patient');

    expect(email.html).toContain('vence en <strong>24 horas</strong>');
    expect(email.text).toContain('vence en 24 horas');
  });

  it('tells a doctor the link expires in 24 hours and uses the doctor subject', async () => {
    const email = await sentEmail('doctor');

    expect(email.subject).toContain('unirte al equipo');
    expect(email.html).toContain('vence en <strong>24 horas</strong>');
    expect(email.text).toContain('vence en 24 horas');
    expect(email.html).not.toContain('48 horas');
  });

  // CLI-174: el preheader y la línea del enlace en texto plano decían
  // "Completá tu registro" también en la invitación a doctores.
  it('a patient gets "Completa tu registro" in the preview and the plain-text link line', async () => {
    const email = await sentEmail('patient');

    expect(email.html).toContain(
      'Nombre, completa tu registro en Clínica Dental Guizada-Aliaga',
    );
    expect(email.text).toContain(
      'Completa tu registro aquí: https://app.example.com/invitacion/tok',
    );
  });

  it('a doctor gets "Crea tu acceso" instead, never the patient wording', async () => {
    const email = await sentEmail('doctor');

    expect(email.html).toContain(
      'Nombre, crea tu acceso al equipo de Clínica Dental Guizada-Aliaga',
    );
    expect(email.text).toContain(
      'Crea tu acceso aquí: https://app.example.com/invitacion/tok',
    );
    expect(email.html).not.toContain('completa tu registro');
    expect(email.text).not.toContain('Completa tu registro');
  });

  it('is written in neutral Spanish, without voseo', async () => {
    for (const kind of ['patient', 'doctor'] as const) {
      fetchMock.mockClear();
      const email = await sentEmail(kind);
      const all = `${email.subject} ${email.html} ${email.text}`;
      expect(all).not.toMatch(
        /Complet[aá] tu registro acá|copiá|pegá|creés|podés|Unite|Completá/,
      );
    }
  });

  it('fails with ServiceUnavailableException when Resend is not configured', async () => {
    delete process.env['RESEND_API_KEY'];

    await expect(
      sender.sendInviteEmail({
        to: 'destino@example.com',
        displayName: 'Nombre',
        inviteUrl: 'https://app.example.com/invitacion/tok',
        kind: 'doctor',
      }),
    ).rejects.toThrow(ServiceUnavailableException);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('surfaces the Resend error message when the API answers with an error', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 422,
      json: () => Promise.resolve({ message: 'dominio no verificado' }),
    });

    await expect(
      sender.sendInviteEmail({
        to: 'destino@example.com',
        displayName: 'Nombre',
        inviteUrl: 'https://app.example.com/invitacion/tok',
        kind: 'patient',
      }),
    ).rejects.toThrow('dominio no verificado');
  });

  describe('sendAccountEmail (CLI-242)', () => {
    async function accountEmail(
      displayName: string | null,
    ): Promise<SentEmail> {
      await sender.sendAccountEmail({
        to: 'carla@example.com',
        displayName,
        actionUrl:
          'https://app.example.com/auth/confirmar?token_hash=abc&type=signup',
        kind: 'confirm_email',
      });
      const [, init] = fetchMock.mock.calls[0] as [string, { body: string }];
      return JSON.parse(init.body) as SentEmail;
    }

    it('manda el correo de confirmación con el link, el botón y el diseño de la clínica', async () => {
      const email = await accountEmail('Carla Mendoza');

      expect(email.subject).toContain('Confirma tu correo');
      expect(email.html).toContain('Hola Carla Mendoza,');
      expect(email.html).toContain('Confirmar mi correo');
      expect(email.html).toContain(
        'href="https://app.example.com/auth/confirmar?token_hash=abc&amp;type=signup"',
      );
      expect(email.html).toContain('cid:clinic-logo');
      expect(email.text).toContain(
        'https://app.example.com/auth/confirmar?token_hash=abc&type=signup',
      );
      expect(email.text).toContain('vence en 24 horas');
    });

    it('el correo de recuperación (CLI-243) aclara que la contraseña actual sigue funcionando', async () => {
      await sender.sendAccountEmail({
        to: 'carla@example.com',
        displayName: null,
        actionUrl:
          'https://app.example.com/auth/reset-password?token_hash=r&type=recovery',
        kind: 'reset_password',
      });
      const [, init] = fetchMock.mock.calls[0] as [string, { body: string }];
      const email = JSON.parse(init.body) as SentEmail;

      expect(email.subject).toContain('nueva contraseña');
      expect(email.html).toContain('Crear nueva contraseña');
      expect(email.text).toContain('tu contraseña actual sigue funcionando');
      expect(email.text).toContain('reset-password?token_hash=r&type=recovery');
    });

    it('sin nombre saluda solo con "Hola,"', async () => {
      const email = await accountEmail(null);

      expect(email.html).toContain('Hola,');
      expect(email.text.startsWith('Hola,')).toBe(true);
    });
  });
});
