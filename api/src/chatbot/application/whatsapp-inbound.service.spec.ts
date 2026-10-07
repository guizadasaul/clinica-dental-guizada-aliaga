import {
  ConflictException,
  HttpException,
  HttpStatus,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { UserRole } from '../../auth/domain/value-objects/UserRole';
import type { InboundWhatsappMessage } from '../domain/WhatsappInbound';
import { WhatsappSendError } from '../domain/WhatsappSender';
import type { ActorResolver } from './actor-resolver';
import type { ChannelLinkingService } from './channel-linking.service';
import type { ChatService } from './chat.service';
import { fallbackReply } from './fallback-reply';
import {
  WHATSAPP_REPLIES,
  WhatsappInboundService,
} from './whatsapp-inbound.service';

const PATIENT = {
  kind: 'user' as const,
  userId: 'u-1',
  role: UserRole.PATIENT,
  patientId: 'p-1',
};

function message(
  overrides: Partial<InboundWhatsappMessage> = {},
): InboundWhatsappMessage {
  return {
    messageId: 'wamid.ABC',
    from: '59171234567',
    timestamp: new Date('2026-09-26T12:00:00Z'),
    type: 'text',
    text: 'MARCADOR-PRIVADO ¿cuánto debo?',
    ...overrides,
  };
}

/** Deja correr la fila de promesas del servicio. */
const flush = () => new Promise((resolve) => setImmediate(resolve));

describe('WhatsappInboundService (CLI-101)', () => {
  const originalEnv = process.env;
  const fromChannelSender = jest.fn();
  const handleMessage = jest.fn();
  const redeem = jest.fn();
  const sendText = jest.fn();
  const sendImage = jest.fn();
  let service: WhatsappInboundService;
  let logSpy: jest.SpyInstance;
  let warnSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      WHATSAPP_ENABLED: 'true',
      WHATSAPP_APP_SECRET: 'secreto',
    };
    jest.resetAllMocks();
    service = new WhatsappInboundService(
      { fromChannelSender } as unknown as ActorResolver,
      { handleMessage } as unknown as ChatService,
      { redeem } as unknown as ChannelLinkingService,
      { sendText, sendImage },
    );
    fromChannelSender.mockResolvedValue({ actor: PATIENT, match: 'patient' });
    handleMessage.mockResolvedValue({
      sessionId: 's-1',
      anonToken: null,
      reply: 'Debes 130 Bs.',
      links: [],
      attachments: [],
    });
    sendText.mockResolvedValue(undefined);
    logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    errorSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.restoreAllMocks();
  });

  function logged(): string {
    return (logSpy.mock.calls as unknown[][])
      .map((call) => String(call[0]))
      .join('\n');
  }

  describe('identificación y auditoría', () => {
    it('identifica por el número normalizado y audita sin el texto ni el número completo', async () => {
      const resolved = await service.process(message());

      expect(fromChannelSender).toHaveBeenCalledWith(
        'whatsapp',
        '+59171234567',
      );
      expect(resolved).toMatchObject({
        number: '+59171234567',
        sender: { match: 'patient' },
      });
      expect(JSON.parse(logged())).toEqual({
        event: 'whatsapp.inbound',
        messageId: 'wamid.ABC',
        from: '•••• 4567',
        type: 'text',
        match: 'patient',
        role: 'patient',
        ts: '2026-09-26T12:00:00.000Z',
      });
      expect(logged()).not.toContain('MARCADOR-PRIVADO');
      expect(logged()).not.toContain('71234567');
    });

    it('un número inválido no se identifica ni se responde', async () => {
      await expect(
        service.process(message({ from: '123' })),
      ).resolves.toBeNull();
      expect(fromChannelSender).not.toHaveBeenCalled();
      expect(sendText).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalled();
    });

    it('sin WHATSAPP_ENABLED="true" recibe y audita, pero no responde', async () => {
      delete process.env['WHATSAPP_ENABLED'];

      await service.process(message());

      expect(logged()).toContain('whatsapp.inbound');
      expect(handleMessage).not.toHaveBeenCalled();
      expect(sendText).not.toHaveBeenCalled();
    });
  });

  describe('respuestas', () => {
    it('un usuario reconocido pasa por el agente y retoma su conversación de WhatsApp', async () => {
      await service.process(message());

      expect(handleMessage).toHaveBeenCalledWith({
        actor: PATIENT,
        channel: 'whatsapp',
        text: 'MARCADOR-PRIVADO ¿cuánto debo?',
        requestId: 'wamid.ABC',
        resumeLatestSession: true,
      });
      expect(sendText).toHaveBeenCalledWith('+59171234567', 'Debes 130 Bs.');
    });

    it('un visitante usa un token derivado del número: estable y distinto por número', async () => {
      fromChannelSender.mockResolvedValue({
        actor: { kind: 'anonymous' },
        match: 'unknown',
      });

      await service.process(message());
      await service.process(message({ messageId: 'wamid.2' }));
      await service.process(
        message({ messageId: 'wamid.3', from: '59176543210' }),
      );

      const tokens = (
        handleMessage.mock.calls as Array<[{ anonToken: string }]>
      ).map(([input]) => input.anonToken);
      expect(handleMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          actor: { kind: 'anonymous' },
          serverIssuedAnonToken: true,
        }),
      );
      expect(tokens[0]).toMatch(/^[\w-]{43}$/);
      expect(tokens[0]).toBe(tokens[1]);
      expect(tokens[2]).not.toBe(tokens[0]);
      expect(tokens[0]).not.toContain('71234567');
    });

    it('los links (ej. el de reserva) van al final como texto', async () => {
      handleMessage.mockResolvedValue({
        sessionId: 's-1',
        anonToken: null,
        reply: 'Te dejo el link.',
        links: [
          {
            label: 'Completar reserva y pago (28/09, 10:00)',
            url: 'https://guizadaaliaga.com/reservar?slot=x',
          },
        ],
        attachments: [],
      });

      await service.process(message());

      expect(sendText).toHaveBeenCalledWith(
        '+59171234567',
        'Te dejo el link.\n\nCompletar reserva y pago (28/09, 10:00): https://guizadaaliaga.com/reservar?slot=x',
      );
    });

    it('el QR de pago (CLI-236) va como imagen después del texto', async () => {
      handleMessage.mockResolvedValue({
        sessionId: 's-1',
        anonToken: null,
        reply: 'Aquí tienes tu QR por Bs. 1050.',
        links: [],
        attachments: [
          {
            type: 'qr_payment',
            chargeId: 'charge-1',
            amountBob: 1050,
            imageBase64: 'cG5n',
            lines: [],
          },
        ],
      });
      sendImage.mockResolvedValue(undefined);

      await service.process(message());

      expect(sendText).toHaveBeenCalledWith(
        '+59171234567',
        'Aquí tienes tu QR por Bs. 1050.',
      );
      expect(sendImage).toHaveBeenCalledWith(
        '+59171234567',
        'cG5n',
        expect.stringContaining('Bs. 1050') as unknown,
      );
      expect(sendText.mock.invocationCallOrder[0]).toBeLessThan(
        sendImage.mock.invocationCallOrder[0],
      );
      const [[, , caption]] = sendImage.mock.calls as [
        string,
        string,
        string,
      ][];
      expect(caption).toContain('ya pagué');
    });

    it('un número compartido responde como visitante y sugiere vincularse', async () => {
      fromChannelSender.mockResolvedValue({
        actor: { kind: 'anonymous' },
        match: 'ambiguous',
      });

      await service.process(message());

      expect(sendText).toHaveBeenCalledWith(
        '+59171234567',
        `${WHATSAPP_REPLIES.ambiguousHint}\n\nDebes 130 Bs.`,
      );
    });

    it.each([
      ['una imagen', { type: 'image', text: null }],
      ['un texto vacío', { text: '' }],
    ])('%s recibe la respuesta de "solo texto"', async (_name, overrides) => {
      await service.process(message(overrides));

      expect(handleMessage).not.toHaveBeenCalled();
      expect(sendText).toHaveBeenCalledWith(
        '+59171234567',
        WHATSAPP_REPLIES.nonText,
      );
    });
  });

  describe('comando VINCULAR (CLI-100)', () => {
    it.each(['VINCULAR 123456', '  vincular   123456 '])(
      '%p canjea el código desde este número',
      async (text) => {
        redeem.mockResolvedValue({
          status: 'linked',
          userId: 'u-1',
          previousUserId: null,
        });

        await service.process(message({ text }));

        expect(redeem).toHaveBeenCalledWith(
          'whatsapp',
          '+59171234567',
          '123456',
        );
        expect(handleMessage).not.toHaveBeenCalled();
        expect(sendText).toHaveBeenCalledWith(
          '+59171234567',
          WHATSAPP_REPLIES.linked,
        );
      },
    );

    it.each(['invalid_code', 'rate_limited'])(
      'si falla (%s) responde genérico, sin decir por qué',
      async (status) => {
        redeem.mockResolvedValue({ status });

        await service.process(message({ text: 'VINCULAR 000000' }));

        expect(sendText).toHaveBeenCalledWith(
          '+59171234567',
          WHATSAPP_REPLIES.linkFailed,
        );
      },
    );
  });

  describe('errores', () => {
    it.each([
      [
        'un turno en curso (409)',
        new ConflictException(),
        WHATSAPP_REPLIES.busy,
      ],
      [
        'la cuota diaria (429)',
        new HttpException('x', HttpStatus.TOO_MANY_REQUESTS),
        WHATSAPP_REPLIES.limit,
      ],
      [
        'el chat apagado (503)',
        new ServiceUnavailableException(),
        fallbackReply('es'),
      ],
    ])('%s tiene su respuesta', async (_name, error, reply) => {
      handleMessage.mockRejectedValue(error);

      await service.process(message());

      expect(sendText).toHaveBeenCalledWith('+59171234567', reply);
      expect(errorSpy).not.toHaveBeenCalled();
    });

    it('un error inesperado del agente responde el fallback y queda en el log', async () => {
      handleMessage.mockRejectedValue(new Error('boom'));

      await service.process(message());

      expect(sendText).toHaveBeenCalledWith(
        '+59171234567',
        fallbackReply('es'),
      );
      expect(errorSpy).toHaveBeenCalled();
    });

    it('si Meta rechaza el envío, se loguea status y código sin romper', async () => {
      sendText.mockRejectedValue(new WhatsappSendError(401, 190));

      await expect(service.process(message())).resolves.not.toBeNull();
      expect(warnSpy).toHaveBeenCalledWith(
        'whatsapp.send falló id=wamid.ABC status=401 code=190',
      );
    });

    it('un error de red al enviar también se loguea', async () => {
      sendText.mockRejectedValue(new WhatsappSendError(null, null));

      await service.process(message());

      expect(warnSpy).toHaveBeenCalledWith(
        'whatsapp.send falló id=wamid.ABC status=red code=-',
      );
    });

    it('un error que no es de envío se propaga', async () => {
      sendText.mockRejectedValue(new Error('otro'));

      await expect(service.process(message())).rejects.toThrow('otro');
    });
  });

  describe('accept', () => {
    it('no espera el procesamiento y un error no se propaga', async () => {
      fromChannelSender.mockRejectedValue(new Error('boom'));

      expect(service.accept([message()])).toBeUndefined();
      await flush();
      await flush();

      expect(errorSpy).toHaveBeenCalledWith(
        'whatsapp.inbound falló id=wamid.ABC',
        expect.any(Error),
      );
    });

    it('un mensaje repetido por Meta (mismo id) no se contesta dos veces', async () => {
      service.accept([message()]);
      service.accept([message()]);
      await flush();
      await flush();

      expect(sendText).toHaveBeenCalledTimes(1);
    });

    it('los mensajes de un mismo número se procesan en orden, uno por vez', async () => {
      const order: string[] = [];
      let releaseFirst!: () => void;
      handleMessage
        .mockImplementationOnce(
          () =>
            new Promise((resolve) => {
              releaseFirst = () => {
                order.push('primero');
                resolve({
                  sessionId: 's',
                  anonToken: null,
                  reply: '1',
                  links: [],
                  attachments: [],
                });
              };
            }),
        )
        .mockImplementationOnce(() => {
          order.push('segundo');
          return Promise.resolve({
            sessionId: 's',
            anonToken: null,
            reply: '2',
            links: [],
            attachments: [],
          });
        });

      service.accept([
        message({ messageId: 'wamid.1' }),
        message({ messageId: 'wamid.2' }),
      ]);
      for (let i = 0; i < 5; i++) await flush();
      expect(order).toEqual([]);
      releaseFirst();
      for (let i = 0; i < 5; i++) await flush();

      expect(order).toEqual(['primero', 'segundo']);
    });

    it('olvida los ids más viejos cuando se llena', async () => {
      const many = Array.from({ length: 1001 }, (_v, i) =>
        message({ messageId: `wamid.${i}`, from: '123' }),
      );

      service.accept(many);
      service.accept([message({ messageId: 'wamid.0', from: '123' })]);
      for (let i = 0; i < 5; i++) await flush();

      // wamid.0 salió del registro al entrar el 1001.º, así que se procesó otra vez.
      expect(warnSpy).toHaveBeenCalledTimes(1002);
    });
  });
});
