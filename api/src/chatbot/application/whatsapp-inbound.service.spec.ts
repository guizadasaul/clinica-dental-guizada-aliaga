import { Logger } from '@nestjs/common';
import { UserRole } from '../../auth/domain/value-objects/UserRole';
import type { InboundWhatsappMessage } from '../domain/WhatsappInbound';
import type { ActorResolver } from './actor-resolver';
import { WhatsappInboundService } from './whatsapp-inbound.service';

const MESSAGE: InboundWhatsappMessage = {
  messageId: 'wamid.ABC',
  from: '59171234567',
  timestamp: new Date('2026-09-26T12:00:00Z'),
  type: 'text',
  text: 'MARCADOR-PRIVADO ¿cuánto debo?',
};

describe('WhatsappInboundService (CLI-101)', () => {
  const fromChannelSender = jest.fn();
  const service = new WhatsappInboundService({
    fromChannelSender,
  } as unknown as ActorResolver);
  let logSpy: jest.SpyInstance;
  let warnSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    fromChannelSender.mockReset();
    logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    errorSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => {});
  });

  afterEach(() => jest.restoreAllMocks());

  it('identifica al remitente por su número normalizado y audita sin el texto', async () => {
    fromChannelSender.mockResolvedValue({
      actor: {
        kind: 'user',
        userId: 'u-1',
        role: UserRole.PATIENT,
        patientId: 'p-1',
      },
      match: 'patient',
    });

    const resolved = await service.process(MESSAGE);

    expect(fromChannelSender).toHaveBeenCalledWith('whatsapp', '+59171234567');
    expect(resolved).toMatchObject({
      number: '+59171234567',
      sender: { match: 'patient' },
    });
    const logged = (logSpy.mock.calls as unknown[][])
      .map((c) => String(c[0]))
      .join('\n');
    expect(JSON.parse(logged)).toEqual({
      event: 'whatsapp.inbound',
      messageId: 'wamid.ABC',
      from: '•••• 4567',
      type: 'text',
      match: 'patient',
      role: 'patient',
      ts: '2026-09-26T12:00:00.000Z',
    });
    expect(logged).not.toContain('MARCADOR-PRIVADO');
    expect(logged).not.toContain('71234567');
  });

  it('un visitante queda auditado como anonymous', async () => {
    fromChannelSender.mockResolvedValue({
      actor: { kind: 'anonymous' },
      match: 'unknown',
    });

    await service.process(MESSAGE);

    expect(String((logSpy.mock.calls as unknown[][])[0][0])).toContain(
      '"role":"anonymous"',
    );
  });

  it('un número inválido no se identifica', async () => {
    await expect(
      service.process({ ...MESSAGE, from: '123' }),
    ).resolves.toBeNull();
    expect(fromChannelSender).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalled();
  });

  it('accept no espera el procesamiento y un error no se propaga', async () => {
    let finish!: () => void;
    fromChannelSender.mockReturnValueOnce(
      new Promise((_resolve, reject) => {
        finish = () => reject(new Error('boom'));
      }),
    );

    expect(service.accept([MESSAGE])).toBeUndefined();
    finish();
    await new Promise((resolve) => setImmediate(resolve));

    expect(errorSpy).toHaveBeenCalledWith(
      'whatsapp.inbound falló id=wamid.ABC',
      expect.any(Error),
    );
  });
});
