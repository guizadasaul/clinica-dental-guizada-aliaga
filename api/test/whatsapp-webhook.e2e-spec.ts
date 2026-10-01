import { createHmac } from 'node:crypto';
import { Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.config';
import {
  WHATSAPP_REPLIES,
  WhatsappInboundService,
} from '../src/chatbot/application/whatsapp-inbound.service';
import { LlmProvider } from '../src/chatbot/domain/LlmProvider';
import { WhatsappSender } from '../src/chatbot/domain/WhatsappSender';
import { textResponse } from '../src/chatbot/application/testing/fake-llm.provider';
import { PrismaService } from '../src/shared/prisma/prisma.service';
import { hashAnonToken } from '../src/chatbot/application/chat.service';
import { ScriptedLlmProvider } from './support/scripted-llm.provider';

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
  let prisma: PrismaService;
  const llm = new ScriptedLlmProvider();
  const sent: Array<{ to: string; text: string }> = [];
  const sender = {
    sendText: (to: string, text: string) => {
      sent.push({ to, text });
      return Promise.resolve();
    },
  };

  beforeAll(async () => {
    process.env['WHATSAPP_VERIFY_TOKEN'] = VERIFY_TOKEN;
    process.env['WHATSAPP_APP_SECRET'] = APP_SECRET;
    process.env['CHATBOT_ENABLED'] = 'true';
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(LlmProvider)
      .useValue(llm)
      .overrideProvider(WhatsappSender)
      .useValue(sender)
      .compile();
    app = moduleFixture.createNestApplication<NestExpressApplication>({
      rawBody: true,
    });
    configureApp(app);
    await app.init();
    inbound = app.get(WhatsappInboundService);
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    // Conversaciones anónimas que crearon las respuestas por WhatsApp.
    const sessions = await prisma.chat_sessions.findMany({
      where: { channel: 'whatsapp', user_id: null },
      select: { id: true, anon_token_hash: true },
    });
    await prisma.chat_sessions.deleteMany({
      where: { id: { in: sessions.map((row) => row.id) } },
    });
    await prisma.chat_link_attempts.deleteMany({
      where: { external_id: '+59170000777' },
    });
    delete process.env['WHATSAPP_ENABLED'];
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

  describe('respuestas por WhatsApp (parte 2)', () => {
    function signedText(id: string, text: string): string {
      return JSON.stringify({
        object: 'whatsapp_business_account',
        entry: [
          {
            changes: [
              {
                field: 'messages',
                value: {
                  messages: [
                    {
                      from: '59170000777',
                      id,
                      timestamp: '1790000000',
                      type: 'text',
                      text: { body: text },
                    },
                  ],
                },
              },
            ],
          },
        ],
      });
    }

    async function waitForReplies(count: number): Promise<void> {
      for (let i = 0; i < 50 && sent.length < count; i++) {
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
    }

    beforeEach(() => {
      process.env['WHATSAPP_ENABLED'] = 'true';
      sent.length = 0;
      jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    });

    it('un visitante recibe la respuesta del mismo agente de la web y la conversación continúa', async () => {
      const first = llm.script([textResponse('Atendemos de lunes a sábado.')]);
      const body = signedText('wamid.R1', '¿Qué horario tienen?');

      await post(body, sign(body)).expect(200);
      await waitForReplies(1);

      expect(sent).toEqual([
        { to: '+59170000777', text: 'Atendemos de lunes a sábado.' },
      ]);
      // Sin tools privadas: lo atiende como visitante.
      expect(first.requests[0].tools.map((t) => t.name)).not.toContain(
        'get_my_balance',
      );

      const second = llm.script([textResponse('De nada.')]);
      const next = signedText('wamid.R2', 'Gracias');
      await post(next, sign(next)).expect(200);
      await waitForReplies(2);

      expect(sent[1].text).toBe('De nada.');
      // Mismo número → misma conversación: el modelo ve el turno anterior.
      expect(second.requests[0].messages.map((m) => m.role)).toEqual([
        'user',
        'assistant',
        'user',
      ]);
      const sessions = await prisma.chat_sessions.count({
        where: { channel: 'whatsapp', user_id: null },
      });
      expect(sessions).toBe(1);
      const stored = await prisma.chat_sessions.findFirst({
        where: { channel: 'whatsapp', user_id: null },
      });
      // El token deriva del número, pero no lo contiene.
      expect(stored?.anon_token_hash).not.toBe(hashAnonToken('+59170000777'));
    });

    it('el mismo mensaje reenviado por Meta no se contesta dos veces', async () => {
      llm.script([textResponse('Hola.')]);
      const body = signedText('wamid.DUP', 'hola');

      await post(body, sign(body)).expect(200);
      await post(body, sign(body)).expect(200);
      await waitForReplies(2);

      expect(sent).toHaveLength(1);
    });

    it('VINCULAR con un código inválido responde genérico sin llamar al modelo', async () => {
      const fake = llm.script([textResponse('no debería')]);
      const body = signedText('wamid.LINK', 'VINCULAR 000000');

      await post(body, sign(body)).expect(200);
      await waitForReplies(1);

      expect(sent).toEqual([
        { to: '+59170000777', text: WHATSAPP_REPLIES.linkFailed },
      ]);
      expect(fake.requests).toHaveLength(0);
    });
  });
});
