import { SchedulerRegistry } from '@nestjs/schedule';
import { WebConsultationReconciler } from './web-consultation-reconciler.service';

const repo = { sync: jest.fn() };

describe('WebConsultationReconciler', () => {
  const savedInterval = process.env.WEB_CONSULTATION_SYNC_INTERVAL_MS;
  let registry: SchedulerRegistry;
  let reconciler: WebConsultationReconciler;

  beforeEach(() => {
    jest.resetAllMocks();
    jest.useFakeTimers();
    repo.sync.mockResolvedValue({ performed: 0, undone: 0 });
    registry = new SchedulerRegistry();
    reconciler = new WebConsultationReconciler(repo, registry);
  });

  afterEach(() => {
    reconciler.onApplicationShutdown();
    jest.useRealTimers();
    process.env.WEB_CONSULTATION_SYNC_INTERVAL_MS = savedInterval;
  });

  it('barre al arrancar y después cada intervalo', async () => {
    process.env.WEB_CONSULTATION_SYNC_INTERVAL_MS = '1000';

    reconciler.onApplicationBootstrap();
    await jest.advanceTimersByTimeAsync(0);
    expect(repo.sync).toHaveBeenCalledTimes(1);

    await jest.advanceTimersByTimeAsync(1000);
    expect(repo.sync).toHaveBeenCalledTimes(2);
    expect(registry.doesExist('interval', 'web-consultation-sync')).toBe(true);
  });

  it('con intervalo 0 no barre ni registra nada', async () => {
    process.env.WEB_CONSULTATION_SYNC_INTERVAL_MS = '0';

    reconciler.onApplicationBootstrap();
    await jest.advanceTimersByTimeAsync(60_000);

    expect(repo.sync).not.toHaveBeenCalled();
    expect(registry.doesExist('interval', 'web-consultation-sync')).toBe(false);
  });

  it('al apagar borra el intervalo', () => {
    process.env.WEB_CONSULTATION_SYNC_INTERVAL_MS = '1000';
    reconciler.onApplicationBootstrap();

    reconciler.onApplicationShutdown();

    expect(registry.doesExist('interval', 'web-consultation-sync')).toBe(false);
  });

  it('nunca corre dos barridos a la vez', async () => {
    let finish: () => void = () => undefined;
    repo.sync.mockReturnValue(
      new Promise((resolve) => {
        finish = () => resolve({ performed: 1, undone: 0 });
      }),
    );

    const first = reconciler.sweep();
    await reconciler.sweep();
    finish();
    await first;

    expect(repo.sync).toHaveBeenCalledTimes(1);
  });

  it('un error no rompe: se loguea y el próximo barrido corre', async () => {
    repo.sync.mockRejectedValueOnce(new Error('db caída'));
    const logError = jest
      .spyOn(reconciler['logger'], 'error')
      .mockImplementation(() => undefined);

    await reconciler.sweep();
    await reconciler.sweep(new Date('2026-10-07T12:00:00Z'));

    expect(logError).toHaveBeenCalled();
    expect(repo.sync).toHaveBeenLastCalledWith(
      new Date('2026-10-07T12:00:00Z'),
    );
  });
});
