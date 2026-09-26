import { createHmac } from 'node:crypto';
import { Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.config';
import { WhatsappInboundService } from '../src/chatbot/application/whatsapp-inbound.service';

/**
 * Webhook de WhatsApp de punta a punta (CLI-101), con la app completa y el
 * mismo bootstrap que main.ts (rawBody: true + configureApp): la firma se
 * calcula sobre el body crudo real que recibe Express.
 */
const VERIFY_TOKEN = 'verify-token-e2e';
const APP_SECRET = 'app-secret-e2e';

function sign(body: string, secret = APP_SECRET): string {
  return `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
}

const TEXT_MESSAGE = JSON.stringify({
  object: 'whatsapp_business_account',
  entry: [
    {
      id: 'waba-1',
      changes: [
        {
          field: 'messages',
          value: {
            messaging_product: 'whatsapp',
            metadata: {
              display_phone_number: '59157744250',
              phone_number_id: 'pn-1',
            },
            contacts: [{ profile: { name: 'Ana' }, wa_id: '59170000777' }],
            messages: [
              {
                from: '59170000777',
                id: 'wamid.E2E',
                timestamp: '1790000000',
                type: 'text',
                text: { body: 'hola' },
              },
            ],
          },
        },
      ],
    },
  ],
});

const STATUS_EVENT = JSON.stringify({
  object: 'whatsapp_business_account',
  entry: [
    {
      changes: [
        {
          field: 'messages',
          value: {
            statuses: [
              { id: 'wamid.E2E', status: 'delivered', recipient_id: '591700' },
            ],
          },
        },
      ],
    },
  ],
});

describe('Webhook de WhatsApp (e2e) — CLI-101', () => {
  let app: NestExpressApplication;
  let inbound: WhatsappInboundService;

  beforeAll(async () => {
    process.env['WHATSAPP_VERIFY_TOKEN'] = VERIFY_TOKEN;
    process.env['WHATSAPP_APP_SECRET'] = APP_SECRET;
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication<NestExpressApplication>({
      rawBody: true,
    });
    configureApp(app);
    await app.init();
    inbound = app.get(WhatsappInboundService);
  });

  afterAll(async () => {
    delete process.env['WHATSAPP_VERIFY_TOKEN'];
    delete process.env['WHATSAPP_APP_SECRET'];
    await app.close();
  });

  afterEach(() => jest.restoreAllMocks());

  function post(body: string, signature?: string) {
    const req = request(app.getHttpServer())
      .post('/webhooks/whatsapp')
      .set('Content-Type', 'application/json');
    return (signature ? req.set('X-Hub-Signature-256', signature) : req).send(
      body,
    );
  }

  describe('GET /webhooks/whatsapp', () => {
    it('con el verify token correcto devuelve 200 y exactamente el challenge', async () => {
      const res = await request(app.getHttpServer())
        .get('/webhooks/whatsapp')
        .query({
          'hub.mode': 'subscribe',
          'hub.verify_token': VERIFY_TOKEN,
          'hub.challenge': '1158201444',
        })
        .expect(200);

      expect(res.text).toBe('1158201444');
    });

    it('con un token incorrecto devuelve 403', async () => {
      await request(app.getHttpServer())
        .get('/webhooks/whatsapp')
        .query({
          'hub.mode': 'subscribe',
          'hub.verify_token': 'otro',
          'hub.challenge': '1158201444',
        })
        .expect(403);
    });
  });

  describe('POST /webhooks/whatsapp', () => {
    it('un mensaje de texto firmado → 200 y se entrega al servicio', async () => {
      const accept = jest.spyOn(inbound, 'accept').mockImplementation(() => {});

      const res = await post(TEXT_MESSAGE, sign(TEXT_MESSAGE)).expect(200);

      expect(res.body).toEqual({ received: 1 });
      expect(accept).toHaveBeenCalledWith([
        expect.objectContaining({
          messageId: 'wamid.E2E',
          from: '59170000777',
          type: 'text',
          text: 'hola',
        }),
      ]);
    });

    it('el mensaje se procesa después de responder, sin romper nada', async () => {
      jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
      const processSpy = jest.spyOn(inbound, 'process');

      await post(TEXT_MESSAGE, sign(TEXT_MESSAGE)).expect(200);
      await new Promise((resolve) => setTimeout(resolve, 100));

      await expect(processSpy.mock.results[0]?.value).resolves.toMatchObject({
        number: '+59170000777',
        sender: { match: 'unknown' },
      });
    });

    it('un evento de status → 200 sin mensajes', async () => {
      const accept = jest.spyOn(inbound, 'accept').mockImplementation(() => {});

      const res = await post(STATUS_EVENT, sign(STATUS_EVENT)).expect(200);

      expect(res.body).toEqual({ received: 0 });
      expect(accept).toHaveBeenCalledWith([]);
    });

    it('un payload firmado que no es de WhatsApp → 400', async () => {
      const body = JSON.stringify({ object: 'page', entry: [] });

      await post(body, sign(body)).expect(400);
    });

    it.each([
      ['sin firma', undefined],
      ['firmado con otro secreto', sign(TEXT_MESSAGE, 'otro')],
    ])('%s → 401', async (_name, signature) => {
      jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
      const accept = jest.spyOn(inbound, 'accept');

      await post(TEXT_MESSAGE, signature).expect(401);
      expect(accept).not.toHaveBeenCalled();
    });

    it('un body alterado después de firmar → 401', async () => {
      jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
      const tampered = TEXT_MESSAGE.replace('hola', 'chau');

      await post(tampered, sign(TEXT_MESSAGE)).expect(401);
    });
  });
});
