import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import type { WhatsappInboundService } from '../../application/whatsapp-inbound.service';
import { WhatsappSignatureGuard } from './whatsapp-signature.guard';
import { WhatsappWebhookController } from './whatsapp-webhook.controller';

const TOKEN = 'verify-token-de-prueba';

describe('WhatsappWebhookController (CLI-101)', () => {
  const originalEnv = process.env;
  const inbound = { accept: jest.fn() };
  const controller = new WhatsappWebhookController(
    inbound as unknown as WhatsappInboundService,
  );

  beforeEach(() => {
    process.env = { ...originalEnv, WHATSAPP_VERIFY_TOKEN: TOKEN };
    inbound.accept.mockReset();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('GET (verificación de Meta)', () => {
    const query = (overrides: Record<string, unknown> = {}) => ({
      'hub.mode': 'subscribe',
      'hub.verify_token': TOKEN,
      'hub.challenge': '1158201444',
      ...overrides,
    });

    it('con el verify token correcto devuelve exactamente el challenge', () => {
      expect(controller.verify(query())).toBe('1158201444');
    });

    it.each([
      ['token incorrecto', { 'hub.verify_token': 'otro' }],
      ['token de otro largo', { 'hub.verify_token': 'x' }],
      ['modo distinto de subscribe', { 'hub.mode': 'unsubscribe' }],
      ['sin challenge', { 'hub.challenge': undefined }],
      ['token repetido (lista)', { 'hub.verify_token': [TOKEN] }],
    ])('%s → 403', (_name, overrides) => {
      expect(() => controller.verify(query(overrides))).toThrow(
        ForbiddenException,
      );
    });

    it('sin WHATSAPP_VERIFY_TOKEN configurado → 403', () => {
      delete process.env['WHATSAPP_VERIFY_TOKEN'];

      expect(() => controller.verify(query())).toThrow(ForbiddenException);
    });
  });

  describe('POST (mensajes)', () => {
    it('está protegido por la firma de Meta', () => {
      expect(
        Reflect.getMetadata(
          GUARDS_METADATA,
          Reflect.get(controller, 'receive') as object,
        ),
      ).toEqual([WhatsappSignatureGuard]);
    });

    it('entrega los mensajes al servicio y responde enseguida', () => {
      const body = {
        object: 'whatsapp_business_account',
        entry: [
          {
            changes: [
              {
                field: 'messages',
                value: {
                  messages: [
                    {
                      from: '59171234567',
                      id: 'wamid.ABC',
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
      };

      expect(controller.receive(body)).toEqual({ received: 1 });
      expect(inbound.accept).toHaveBeenCalledWith([
        expect.objectContaining({ messageId: 'wamid.ABC', text: 'hola' }),
      ]);
    });

    it('un payload que no es de WhatsApp → 400', () => {
      expect(() => controller.receive({ object: 'page' })).toThrow(
        BadRequestException,
      );
      expect(inbound.accept).not.toHaveBeenCalled();
    });
  });
});
