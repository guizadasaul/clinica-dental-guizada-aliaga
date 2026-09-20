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
  it('tells a patient the link expires in 5 minutes, in both the html and the plain-text part', async () => {
    const email = await sentEmail('patient');

    expect(email.html).toContain('vence en <strong>5 minutos</strong>');
    expect(email.text).toContain('vence en 5 minutos');
  });

  it('tells a doctor the link expires in 48 hours and uses the doctor subject', async () => {
    const email = await sentEmail('doctor');

    expect(email.subject).toContain('unirte al staff');
    expect(email.html).toContain('vence en <strong>48 horas</strong>');
    expect(email.text).toContain('vence en 48 horas');
    expect(email.html).not.toContain('5 minutos');
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
});
