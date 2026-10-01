import { parseWhatsappWebhook } from './whatsapp-webhook.parser';

function webhook(value: Record<string, unknown>, field = 'messages') {
  return {
    object: 'whatsapp_business_account',
    entry: [{ id: 'waba-1', changes: [{ field, value }] }],
  };
}

const METADATA = {
  messaging_product: 'whatsapp',
  metadata: { display_phone_number: '59157744250', phone_number_id: 'pn-1' },
};

describe('parseWhatsappWebhook (CLI-101)', () => {
  it('extrae un mensaje de texto: número, id, timestamp, tipo y contenido', () => {
    const parsed = parseWhatsappWebhook(
      webhook({
        ...METADATA,
        contacts: [{ profile: { name: 'Ana' }, wa_id: '59171234567' }],
        messages: [
          {
            from: '59171234567',
            id: 'wamid.ABC',
            timestamp: '1790000000',
            type: 'text',
            text: { body: '¿Cuándo es mi próxima cita?' },
          },
        ],
      }),
    );

    expect(parsed).toEqual({
      messages: [
        {
          messageId: 'wamid.ABC',
          from: '59171234567',
          timestamp: new Date(1790000000 * 1000),
          type: 'text',
          text: '¿Cuándo es mi próxima cita?',
        },
      ],
      ignoredEvents: 0,
    });
  });

  it('un mensaje que no es texto se extrae sin contenido', () => {
    const parsed = parseWhatsappWebhook(
      webhook({
        ...METADATA,
        messages: [
          {
            from: '59171234567',
            id: 'wamid.IMG',
            timestamp: '1790000000',
            type: 'image',
            image: { id: 'media-1' },
          },
        ],
      }),
    );

    expect(parsed?.messages).toEqual([
      expect.objectContaining({ type: 'image', text: null }),
    ]);
  });

  it('corta un texto demasiado largo y tolera un timestamp raro', () => {
    const parsed = parseWhatsappWebhook(
      webhook({
        messages: [
          {
            from: '59171234567',
            id: 'wamid.LONG',
            timestamp: 'nunca',
            type: 'text',
            text: { body: 'x'.repeat(5000) },
          },
        ],
      }),
    );

    expect(parsed?.messages[0].text).toHaveLength(4096);
    expect(parsed?.messages[0].timestamp).toBeInstanceOf(Date);
  });

  it('los statuses (entregado, leído) se ignoran sin error', () => {
    const parsed = parseWhatsappWebhook(
      webhook({
        ...METADATA,
        statuses: [
          { id: 'wamid.X', status: 'delivered', recipient_id: '59171234567' },
          { id: 'wamid.X', status: 'read', recipient_id: '59171234567' },
        ],
      }),
    );

    expect(parsed).toEqual({ messages: [], ignoredEvents: 2 });
  });

  it('otros fields, cambios sin value y mensajes mal formados se ignoran', () => {
    const parsed = parseWhatsappWebhook({
      object: 'whatsapp_business_account',
      entry: [
        {
          changes: [
            { field: 'account_update', value: { event: 'x' } },
            { field: 'messages' },
            'raro',
            { field: 'messages', value: { messages: [{ id: 1 }, null] } },
          ],
        },
        { sinChanges: true },
        null,
      ],
    });

    expect(parsed).toEqual({ messages: [], ignoredEvents: 5 });
  });

  it.each([
    ['null', null],
    ['un texto', 'hola'],
    ['otro object', { object: 'page', entry: [] }],
    ['sin entry', { object: 'whatsapp_business_account' }],
    [
      'entry que no es lista',
      { object: 'whatsapp_business_account', entry: {} },
    ],
  ])('un payload inválido (%s) devuelve null', (_name, body) => {
    expect(parseWhatsappWebhook(body)).toBeNull();
  });
});
