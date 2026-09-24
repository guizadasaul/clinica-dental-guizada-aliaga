import { Logger } from '@nestjs/common';
import type { ChatRepository } from '../domain/ChatRepository';
import { ChatRetentionScheduler } from './chat-retention.scheduler';

const NOW = new Date('2026-09-24T12:00:00Z');

describe('ChatRetentionScheduler', () => {
  const originalEnv = process.env;
  const deleteInactiveSince = jest.fn();
  const scheduler = new ChatRetentionScheduler({
    deleteInactiveSince,
  } as unknown as ChatRepository);
  let logSpy: jest.SpyInstance;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env['CHAT_RETENTION_DAYS'];
    deleteInactiveSince.mockReset();
    logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = originalEnv;
    logSpy.mockRestore();
  });

  it('por defecto borra lo inactivo hace más de 30 días', async () => {
    deleteInactiveSince.mockResolvedValue(3);

    await expect(scheduler.purgeExpired(NOW)).resolves.toBe(3);

    expect(deleteInactiveSince).toHaveBeenCalledWith(
      new Date('2026-08-25T12:00:00Z'),
    );
    expect(logSpy).toHaveBeenCalledWith(
      'Retención del chatbot: 3 conversación(es) borrada(s)',
    );
  });

  it('respeta CHAT_RETENTION_DAYS', async () => {
    process.env['CHAT_RETENTION_DAYS'] = '7';
    deleteInactiveSince.mockResolvedValue(0);

    await scheduler.purgeExpired(NOW);

    expect(deleteInactiveSince).toHaveBeenCalledWith(
      new Date('2026-09-17T12:00:00Z'),
    );
  });

  it('ignora un CHAT_RETENTION_DAYS inválido y usa el default', async () => {
    process.env['CHAT_RETENTION_DAYS'] = 'nunca';
    deleteInactiveSince.mockResolvedValue(0);

    await scheduler.purgeExpired(NOW);

    expect(deleteInactiveSince).toHaveBeenCalledWith(
      new Date('2026-08-25T12:00:00Z'),
    );
  });

  it('no loguea nada si no había nada para borrar', async () => {
    deleteInactiveSince.mockResolvedValue(0);

    await scheduler.purgeExpired(NOW);

    expect(logSpy).not.toHaveBeenCalled();
  });

  it('usa la fecha actual cuando lo dispara el cron (sin argumentos)', async () => {
    deleteInactiveSince.mockResolvedValue(0);
    const before = Date.now();

    await scheduler.purgeExpired();

    const cutoff = (deleteInactiveSince.mock.calls[0] as [Date])[0].getTime();
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
    expect(cutoff).toBeGreaterThanOrEqual(before - thirtyDaysMs);
    expect(cutoff).toBeLessThanOrEqual(Date.now() - thirtyDaysMs);
  });
});
