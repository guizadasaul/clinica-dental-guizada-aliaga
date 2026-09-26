import { NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import type {
  ChannelIdentity,
  ChannelIdentityRepository,
  LinkIdentityResult,
  LinkableChannel,
  NewLinkCodeData,
} from '../domain/ChannelIdentity';
import {
  ChannelLinkingService,
  hashLinkCode,
  normalizeExternalNumber,
} from './channel-linking.service';

const NOW = new Date('2026-09-26T12:00:00Z');
const MINUTE = 60 * 1000;
const NUMBER = '+59171234567';

interface StoredCode extends NewLinkCodeData {
  usedAt: Date | null;
}

/** Repositorio en memoria con la misma semántica que el de Prisma. */
class InMemoryChannelIdentityRepository implements ChannelIdentityRepository {
  codes: StoredCode[] = [];
  attempts: Array<{ externalId: string; succeeded: boolean; at: Date }> = [];
  identities: ChannelIdentity[] = [];
  clock = NOW;
  private nextId = 1;

  replaceLinkCode(data: NewLinkCodeData): Promise<void> {
    this.codes = this.codes.filter(
      (c) =>
        !(c.userId === data.userId && c.channel === data.channel && !c.usedAt),
    );
    this.codes.push({ ...data, usedAt: null });
    return Promise.resolve();
  }

  hasActiveLinkCode(codeHash: string, now: Date): Promise<boolean> {
    return Promise.resolve(
      this.codes.some(
        (c) => c.codeHash === codeHash && !c.usedAt && c.expiresAt > now,
      ),
    );
  }

  consumeLinkCode(
    channel: LinkableChannel,
    codeHash: string,
    now: Date,
  ): Promise<string | null> {
    const code = this.codes.find(
      (c) =>
        c.channel === channel &&
        c.codeHash === codeHash &&
        !c.usedAt &&
        c.expiresAt > now,
    );
    if (!code) return Promise.resolve(null);
    code.usedAt = now;
    return Promise.resolve(code.userId);
  }

  countFailedAttemptsSince(
    _channel: LinkableChannel,
    externalId: string,
    since: Date,
  ): Promise<number> {
    return Promise.resolve(
      this.attempts.filter(
        (a) => a.externalId === externalId && !a.succeeded && a.at >= since,
      ).length,
    );
  }

  recordAttempt(
    _channel: LinkableChannel,
    externalId: string,
    succeeded: boolean,
  ): Promise<void> {
    this.attempts.push({ externalId, succeeded, at: this.clock });
    return Promise.resolve();
  }

  linkIdentity(
    userId: string,
    channel: LinkableChannel,
    externalId: string,
    now: Date,
  ): Promise<LinkIdentityResult> {
    const active = this.identities.find(
      (i) =>
        i.channel === channel && i.externalId === externalId && !i.revokedAt,
    );
    if (active?.userId === userId) {
      return Promise.resolve({ identity: active, previousUserId: null });
    }
    if (active) active.revokedAt = now;
    const identity: ChannelIdentity = {
      id: `link-${this.nextId++}`,
      userId,
      channel,
      externalId,
      verifiedAt: now,
      revokedAt: null,
    };
    this.identities.push(identity);
    return Promise.resolve({
      identity,
      previousUserId: active?.userId ?? null,
    });
  }

  findActiveByExternalId(
    channel: LinkableChannel,
    externalId: string,
  ): Promise<ChannelIdentity | null> {
    return Promise.resolve(
      this.identities.find(
        (i) =>
          i.channel === channel && i.externalId === externalId && !i.revokedAt,
      ) ?? null,
    );
  }

  findActiveForUser(userId: string): Promise<ChannelIdentity[]> {
    return Promise.resolve(
      this.identities.filter((i) => i.userId === userId && !i.revokedAt),
    );
  }

  revokeForUser(id: string, userId: string, now: Date): Promise<boolean> {
    const identity = this.identities.find(
      (i) => i.id === id && i.userId === userId && !i.revokedAt,
    );
    if (identity) identity.revokedAt = now;
    return Promise.resolve(Boolean(identity));
  }

  purgeLinkDataBefore(): Promise<number> {
    return Promise.resolve(0);
  }
}

describe('ChannelLinkingService (CLI-100)', () => {
  const originalEnv = process.env;
  let repo: InMemoryChannelIdentityRepository;
  let service: ChannelLinkingService;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env['CHAT_LINK_CODE_TTL_MINUTES'];
    repo = new InMemoryChannelIdentityRepository();
    service = new ChannelLinkingService(repo);
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('requestCode', () => {
    it('da un código de 6 dígitos que vence en 10 minutos y guarda solo su hash', async () => {
      const issued = await service.requestCode('user-1', 'whatsapp', NOW);

      expect(issued.code).toMatch(/^\d{6}$/);
      expect(issued.command).toBe(`VINCULAR ${issued.code}`);
      expect(issued.sendTo).toContain('577');
      expect(issued.expiresAt).toEqual(new Date(NOW.getTime() + 10 * MINUTE));
      expect(repo.codes).toHaveLength(1);
      expect(repo.codes[0].codeHash).toBe(hashLinkCode(issued.code));
      expect(JSON.stringify(repo.codes)).not.toContain(`"${issued.code}"`);
    });

    it('respeta CHAT_LINK_CODE_TTL_MINUTES', async () => {
      process.env['CHAT_LINK_CODE_TTL_MINUTES'] = '3';

      const issued = await service.requestCode('user-1', 'whatsapp', NOW);

      expect(issued.expiresAt).toEqual(new Date(NOW.getTime() + 3 * MINUTE));
    });

    it('un código nuevo invalida el anterior sin usar', async () => {
      const first = await service.requestCode('user-1', 'whatsapp', NOW);
      await service.requestCode('user-1', 'whatsapp', NOW);

      await expect(
        service.redeem('whatsapp', NUMBER, first.code, NOW),
      ).resolves.toEqual({ status: 'invalid_code' });
    });

    it('no repite un código vigente; si no logra uno libre, falla sin guardar', async () => {
      const busy = {
        hasActiveLinkCode: jest.fn().mockResolvedValue(true),
        replaceLinkCode: jest.fn(),
      };
      const stuck = new ChannelLinkingService(
        busy as unknown as ChannelIdentityRepository,
      );

      await expect(
        stuck.requestCode('user-1', 'whatsapp', NOW),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
      expect(busy.hasActiveLinkCode).toHaveBeenCalledTimes(5);
      expect(busy.replaceLinkCode).not.toHaveBeenCalled();
    });

    it('usa la hora actual si no se la pasan', async () => {
      const before = Date.now();

      const issued = await service.requestCode('user-1', 'whatsapp');

      expect(issued.expiresAt.getTime()).toBeGreaterThanOrEqual(
        before + 10 * MINUTE,
      );
    });
  });

  describe('redeem', () => {
    it('vincula el número con el código vigente y lo marca como usado', async () => {
      const { code } = await service.requestCode('user-1', 'whatsapp', NOW);

      await expect(
        service.redeem('whatsapp', '59171234567', ` ${code} `, NOW),
      ).resolves.toEqual({
        status: 'linked',
        userId: 'user-1',
        previousUserId: null,
      });
      expect(repo.identities).toMatchObject([
        { userId: 'user-1', externalId: NUMBER, revokedAt: null },
      ]);
      // Usado: no se puede volver a canjear.
      await expect(
        service.redeem('whatsapp', NUMBER, code, NOW),
      ).resolves.toEqual({ status: 'invalid_code' });
    });

    it('un código vencido no vincula', async () => {
      const { code } = await service.requestCode('user-1', 'whatsapp', NOW);
      const later = new Date(NOW.getTime() + 11 * MINUTE);

      await expect(
        service.redeem('whatsapp', NUMBER, code, later),
      ).resolves.toEqual({ status: 'invalid_code' });
      expect(repo.identities).toHaveLength(0);
    });

    it.each(['000000', '12345', 'abcdef', ''])(
      'un código incorrecto o mal formado (%p) no vincula y cuenta como intento fallido',
      async (code) => {
        await service.requestCode('user-1', 'whatsapp', NOW);

        await expect(
          service.redeem('whatsapp', NUMBER, code, NOW),
        ).resolves.toEqual({ status: 'invalid_code' });
        expect(repo.attempts).toEqual([
          { externalId: NUMBER, succeeded: false, at: NOW },
        ]);
      },
    );

    it('después de 5 intentos fallidos en una hora, el 6.º se rechaza aunque el código sea correcto', async () => {
      const { code } = await service.requestCode('user-1', 'whatsapp', NOW);
      for (let i = 0; i < 5; i++) {
        await service.redeem('whatsapp', NUMBER, '999999', NOW);
      }

      await expect(
        service.redeem('whatsapp', NUMBER, code, NOW),
      ).resolves.toEqual({ status: 'rate_limited' });
      expect(repo.identities).toHaveLength(0);
    });

    it('los intentos fallidos de hace más de una hora ya no cuentan', async () => {
      const oneHourAgo = new Date(NOW.getTime() - 61 * MINUTE);
      repo.clock = oneHourAgo;
      for (let i = 0; i < 5; i++) {
        await service.redeem('whatsapp', NUMBER, '999999', oneHourAgo);
      }
      repo.clock = NOW;
      const { code } = await service.requestCode('user-1', 'whatsapp', NOW);

      await expect(
        service.redeem('whatsapp', NUMBER, code, NOW),
      ).resolves.toMatchObject({ status: 'linked' });
    });

    it('el límite es por número: otro número no se ve afectado', async () => {
      for (let i = 0; i < 5; i++) {
        await service.redeem('whatsapp', NUMBER, '999999', NOW);
      }
      const { code } = await service.requestCode('user-1', 'whatsapp', NOW);

      await expect(
        service.redeem('whatsapp', '+59176543210', code, NOW),
      ).resolves.toMatchObject({ status: 'linked' });
    });

    it('un número ya vinculado a otra cuenta pasa a la nueva y revoca el vínculo anterior', async () => {
      const first = await service.requestCode('user-1', 'whatsapp', NOW);
      await service.redeem('whatsapp', NUMBER, first.code, NOW);
      const second = await service.requestCode('user-2', 'whatsapp', NOW);

      await expect(
        service.redeem('whatsapp', NUMBER, second.code, NOW),
      ).resolves.toEqual({
        status: 'linked',
        userId: 'user-2',
        previousUserId: 'user-1',
      });
      expect(
        await repo.findActiveByExternalId('whatsapp', NUMBER),
      ).toMatchObject({
        userId: 'user-2',
      });
      expect(await repo.findActiveForUser('user-1')).toEqual([]);
    });

    it('un número inválido no consulta nada', async () => {
      await expect(
        service.redeem('whatsapp', '123', '123456', NOW),
      ).resolves.toEqual({ status: 'invalid_number' });
      expect(repo.attempts).toHaveLength(0);
    });

    it('usa la hora actual si no se la pasan', async () => {
      const { code } = await service.requestCode('user-1', 'whatsapp');

      await expect(
        service.redeem('whatsapp', NUMBER, code),
      ).resolves.toMatchObject({
        status: 'linked',
      });
    });
  });

  describe('listLinks / unlink', () => {
    it('lista los vínculos activos con el número enmascarado', async () => {
      const { code } = await service.requestCode('user-1', 'whatsapp', NOW);
      await service.redeem('whatsapp', NUMBER, code, NOW);

      await expect(service.listLinks('user-1')).resolves.toEqual([
        {
          id: 'link-1',
          channel: 'whatsapp',
          number: '•••• 4567',
          verifiedAt: NOW,
        },
      ]);
    });

    it('desvincula un vínculo propio; uno ajeno o inexistente es 404', async () => {
      const { code } = await service.requestCode('user-1', 'whatsapp', NOW);
      await service.redeem('whatsapp', NUMBER, code, NOW);

      await expect(
        service.unlink('user-2', 'link-1', NOW),
      ).rejects.toBeInstanceOf(NotFoundException);
      await service.unlink('user-1', 'link-1');
      await expect(service.listLinks('user-1')).resolves.toEqual([]);
      await expect(
        service.unlink('user-1', 'link-1', NOW),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('normalizeExternalNumber', () => {
    it.each([
      ['59171234567', '+59171234567'],
      ['+591 712-34567', '+59171234567'],
      ['5491123456789', '+5491123456789'],
    ])('%s → %s', (raw, e164) => {
      expect(normalizeExternalNumber(raw)).toBe(e164);
    });

    it.each(['', '123', '+59100000000000000'])('rechaza %p', (raw) => {
      expect(normalizeExternalNumber(raw)).toBeNull();
    });
  });
});
