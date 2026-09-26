import { WhatsappSendError } from '../../domain/WhatsappSender';
import { WhatsappCloudClient } from './whatsapp-cloud.client';

const TOKEN = 'EAAtoken-secreto';

describe('WhatsappCloudClient (CLI-101)', () => {
  const originalEnv = process.env;
  const client = new WhatsappCloudClient();
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      WHATSAPP_TOKEN: TOKEN,
      WHATSAPP_PHONE_NUMBER_ID: 'pn-123',
    };
    delete process.env['WHATSAPP_API_VERSION'];
    fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('{"messages":[{"id":"wamid.X"}]}'));
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.restoreAllMocks();
  });

  function sentRequest(): { url: string; init: RequestInit; body: unknown } {
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    return { url, init, body: JSON.parse(init.body as string) };
  }

  it('manda un texto al número del destinatario por la Cloud API', async () => {
    await client.sendText('+59171234567', 'Hola');

    const { url, init, body } = sentRequest();
    expect(url).toBe('https://graph.facebook.com/v23.0/pn-123/messages');
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
    });
    expect(body).toEqual({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: '59171234567',
      type: 'text',
      text: { preview_url: false, body: 'Hola' },
    });
  });

  it('respeta WHATSAPP_API_VERSION y corta el texto a 4096 caracteres', async () => {
    process.env['WHATSAPP_API_VERSION'] = 'v99.0';

    await client.sendText('59171234567', 'x'.repeat(5000));

    const { url, body } = sentRequest();
    expect(url).toContain('/v99.0/');
    expect((body as { text: { body: string } }).text.body).toHaveLength(4096);
  });

  it.each([
    ['sin token', 'WHATSAPP_TOKEN'],
    ['sin Phone Number ID', 'WHATSAPP_PHONE_NUMBER_ID'],
  ])('%s falla sin llamar a Meta', async (_name, variable) => {
    delete process.env[variable];

    await expect(client.sendText('59171234567', 'x')).rejects.toBeInstanceOf(
      WhatsappSendError,
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('una respuesta de error lleva status y código de Meta, nunca el token ni el cuerpo', async () => {
    fetchSpy.mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            code: 190,
            message: `Invalid OAuth access token ${TOKEN}`,
          },
        }),
        { status: 401 },
      ),
    );

    const error = (await client
      .sendText('59171234567', 'x')
      .catch((e: unknown) => e)) as WhatsappSendError;

    expect(error).toBeInstanceOf(WhatsappSendError);
    expect(error.status).toBe(401);
    expect(error.providerCode).toBe(190);
    expect(error.message).not.toContain(TOKEN);
    expect(error.message).not.toContain('Invalid OAuth');
  });

  it.each([
    ['un cuerpo que no es JSON', new Response('caído', { status: 502 })],
    ['un error sin código', new Response('{"error":{}}', { status: 400 })],
  ])('%s deja el código en null', async (_name, response) => {
    fetchSpy.mockResolvedValue(response);

    await expect(client.sendText('59171234567', 'x')).rejects.toMatchObject({
      providerCode: null,
    });
  });

  it('un error de red o timeout también es WhatsappSendError', async () => {
    fetchSpy.mockRejectedValue(new Error('timeout'));

    await expect(client.sendText('59171234567', 'x')).rejects.toMatchObject({
      status: null,
      providerCode: null,
    });
  });
});
