import { PrismaChannelIdentityRepository } from './prisma-channel-identity.repository';

const NOW = new Date('2026-09-26T12:00:00Z');

function identityRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'link-1',
    user_id: 'user-1',
    channel: 'whatsapp',
    external_id: '+59171234567',
    verified_at: NOW,
    revoked_at: null,
    created_at: NOW,
    ...overrides,
  };
}

describe('PrismaChannelIdentityRepository', () => {
  const chat_link_codes = {
    deleteMany: jest.fn(),
    create: jest.fn(),
    count: jest.fn(),
    findFirst: jest.fn(),
    updateMany: jest.fn(),
  };
  const chat_link_attempts = {
    count: jest.fn(),
    create: jest.fn(),
    deleteMany: jest.fn(),
  };
  const chat_channel_identities = {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    create: jest.fn(),
  };
  const tx = { chat_link_codes, chat_channel_identities };
  const transaction = jest.fn((fn: (client: unknown) => Promise<unknown>) =>
    fn(tx),
  );
  const repo = new PrismaChannelIdentityRepository({
    chat_link_codes,
    chat_link_attempts,
    chat_channel_identities,
    transaction,
  } as never);

  beforeEach(() => jest.clearAllMocks());

  it('replaceLinkCode borra los códigos sin usar del usuario y crea el nuevo en una transacción', async () => {
    await repo.replaceLinkCode({
      userId: 'user-1',
      channel: 'whatsapp',
      codeHash: 'h'.repeat(64),
      expiresAt: NOW,
    });

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(chat_link_codes.deleteMany).toHaveBeenCalledWith({
      where: { user_id: 'user-1', channel: 'whatsapp', used_at: null },
    });
    expect(chat_link_codes.create).toHaveBeenCalledWith({
      data: {
        user_id: 'user-1',
        channel: 'whatsapp',
        code_hash: 'h'.repeat(64),
        expires_at: NOW,
      },
    });
  });

  it('hasActiveLinkCode busca un código sin usar y sin vencer con ese hash', async () => {
    chat_link_codes.count.mockResolvedValue(1);

    await expect(repo.hasActiveLinkCode('hash', NOW)).resolves.toBe(true);
    expect(chat_link_codes.count).toHaveBeenCalledWith({
      where: { code_hash: 'hash', used_at: null, expires_at: { gt: NOW } },
    });
  });

  describe('consumeLinkCode', () => {
    it('marca el código vigente como usado y devuelve su dueño', async () => {
      chat_link_codes.findFirst.mockResolvedValue({
        id: 'code-1',
        user_id: 'user-1',
      });
      chat_link_codes.updateMany.mockResolvedValue({ count: 1 });

      await expect(repo.consumeLinkCode('whatsapp', 'hash', NOW)).resolves.toBe(
        'user-1',
      );
      expect(chat_link_codes.findFirst).toHaveBeenCalledWith({
        where: {
          channel: 'whatsapp',
          code_hash: 'hash',
          used_at: null,
          expires_at: { gt: NOW },
        },
      });
      expect(chat_link_codes.updateMany).toHaveBeenCalledWith({
        where: { id: 'code-1', used_at: null },
        data: { used_at: NOW },
      });
    });

    it('sin código vigente devuelve null', async () => {
      chat_link_codes.findFirst.mockResolvedValue(null);

      await expect(
        repo.consumeLinkCode('whatsapp', 'hash', NOW),
      ).resolves.toBeNull();
      expect(chat_link_codes.updateMany).not.toHaveBeenCalled();
    });

    it('si otro canje lo usó primero, devuelve null', async () => {
      chat_link_codes.findFirst.mockResolvedValue({
        id: 'code-1',
        user_id: 'user-1',
      });
      chat_link_codes.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        repo.consumeLinkCode('whatsapp', 'hash', NOW),
      ).resolves.toBeNull();
    });
  });

  it('cuenta los intentos fallidos del número desde una fecha y registra intentos', async () => {
    chat_link_attempts.count.mockResolvedValue(3);

    await expect(
      repo.countFailedAttemptsSince('whatsapp', '+59171234567', NOW),
    ).resolves.toBe(3);
    await repo.recordAttempt('whatsapp', '+59171234567', true);

    expect(chat_link_attempts.count).toHaveBeenCalledWith({
      where: {
        channel: 'whatsapp',
        external_id: '+59171234567',
        succeeded: false,
        created_at: { gte: NOW },
      },
    });
    expect(chat_link_attempts.create).toHaveBeenCalledWith({
      data: {
        channel: 'whatsapp',
        external_id: '+59171234567',
        succeeded: true,
      },
    });
  });

  describe('linkIdentity', () => {
    it('crea el vínculo si el número no tenía uno activo', async () => {
      chat_channel_identities.findFirst.mockResolvedValue(null);
      chat_channel_identities.create.mockResolvedValue(identityRow());

      await expect(
        repo.linkIdentity('user-1', 'whatsapp', '+59171234567', NOW),
      ).resolves.toEqual({
        identity: {
          id: 'link-1',
          userId: 'user-1',
          channel: 'whatsapp',
          externalId: '+59171234567',
          verifiedAt: NOW,
          revokedAt: null,
        },
        previousUserId: null,
      });
      expect(chat_channel_identities.create).toHaveBeenCalledWith({
        data: {
          user_id: 'user-1',
          channel: 'whatsapp',
          external_id: '+59171234567',
          verified_at: NOW,
        },
      });
      expect(chat_channel_identities.update).not.toHaveBeenCalled();
    });

    it('si ya era de este usuario, lo deja como está', async () => {
      chat_channel_identities.findFirst.mockResolvedValue(identityRow());

      await expect(
        repo.linkIdentity('user-1', 'whatsapp', '+59171234567', NOW),
      ).resolves.toMatchObject({ previousUserId: null });
      expect(chat_channel_identities.create).not.toHaveBeenCalled();
      expect(chat_channel_identities.update).not.toHaveBeenCalled();
    });

    it('si era de otra cuenta, revoca ese vínculo y crea el nuevo', async () => {
      chat_channel_identities.findFirst.mockResolvedValue(
        identityRow({ id: 'link-0', user_id: 'user-0' }),
      );
      chat_channel_identities.create.mockResolvedValue(identityRow());

      await expect(
        repo.linkIdentity('user-1', 'whatsapp', '+59171234567', NOW),
      ).resolves.toMatchObject({ previousUserId: 'user-0' });
      expect(chat_channel_identities.update).toHaveBeenCalledWith({
        where: { id: 'link-0' },
        data: { revoked_at: NOW },
      });
    });
  });

  it('findActiveByExternalId y findActiveForUser solo miran vínculos sin revocar', async () => {
    chat_channel_identities.findFirst.mockResolvedValueOnce(null);
    chat_channel_identities.findMany.mockResolvedValue([identityRow()]);

    await expect(
      repo.findActiveByExternalId('whatsapp', '+59171234567'),
    ).resolves.toBeNull();
    await expect(repo.findActiveForUser('user-1')).resolves.toHaveLength(1);

    expect(chat_channel_identities.findFirst).toHaveBeenCalledWith({
      where: {
        channel: 'whatsapp',
        external_id: '+59171234567',
        revoked_at: null,
      },
    });
    expect(chat_channel_identities.findMany).toHaveBeenCalledWith({
      where: { user_id: 'user-1', revoked_at: null },
      orderBy: { verified_at: 'desc' },
    });
  });

  it('findActiveByExternalId mapea el vínculo encontrado', async () => {
    chat_channel_identities.findFirst.mockResolvedValue(identityRow());

    await expect(
      repo.findActiveByExternalId('whatsapp', '+59171234567'),
    ).resolves.toMatchObject({ userId: 'user-1', externalId: '+59171234567' });
  });

  it('revokeForUser solo revoca un vínculo activo del propio usuario', async () => {
    chat_channel_identities.updateMany.mockResolvedValueOnce({ count: 1 });
    chat_channel_identities.updateMany.mockResolvedValueOnce({ count: 0 });

    await expect(repo.revokeForUser('link-1', 'user-1', NOW)).resolves.toBe(
      true,
    );
    await expect(repo.revokeForUser('link-1', 'user-2', NOW)).resolves.toBe(
      false,
    );
    expect(chat_channel_identities.updateMany).toHaveBeenCalledWith({
      where: { id: 'link-1', user_id: 'user-1', revoked_at: null },
      data: { revoked_at: NOW },
    });
  });

  it('purgeLinkDataBefore borra códigos vencidos o usados e intentos viejos', async () => {
    chat_link_codes.deleteMany.mockResolvedValue({ count: 2 });
    chat_link_attempts.deleteMany.mockResolvedValue({ count: 5 });

    await expect(repo.purgeLinkDataBefore(NOW)).resolves.toBe(7);
    expect(chat_link_codes.deleteMany).toHaveBeenCalledWith({
      where: { OR: [{ expires_at: { lt: NOW } }, { used_at: { lt: NOW } }] },
    });
    expect(chat_link_attempts.deleteMany).toHaveBeenCalledWith({
      where: { created_at: { lt: NOW } },
    });
  });
});
