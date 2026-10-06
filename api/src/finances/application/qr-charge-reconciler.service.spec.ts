import type { SchedulerRegistry } from '@nestjs/schedule';
import {
  QrChargeReconciler,
  QR_CHARGE_MAX_AGE_MS,
} from './qr-charge-reconciler.service';
import type { FinancesService } from './finances.service';
import type { QrCharge } from '../../quotes/domain/QrCharge';

const NOW = new Date('2026-10-06T15:00:00Z');

function charge(id: string, ageMs: number): QrCharge {
  return {
    id,
    quoteId: 'quote-1',
    amount: 100,
    qrId: `qr-${id}`,
    transactionId: `tx-${id}`,
    qrImageBase64: 'img',
    status: 'pending',
    paymentId: null,
    createdAt: new Date(NOW.getTime() - ageMs),
    lines: [],
  };
}

describe('QrChargeReconciler (CLI-220)', () => {
  const finances = {
    findPendingQrCharges: jest.fn(),
    findQrChargeByQrId: jest.fn(),
    verifyQrCharge: jest.fn(),
    cancelQrCharge: jest.fn(),
  };
  const registry = {
    addInterval: jest.fn(),
    doesExist: jest.fn(),
    deleteInterval: jest.fn(),
  };
  const reconciler = new QrChargeReconciler(
    finances as unknown as FinancesService,
    registry as unknown as SchedulerRegistry,
  );
  const ORIGINAL_ENV = process.env.QR_RECONCILE_INTERVAL_MS;

  beforeEach(() => jest.resetAllMocks());
  afterEach(() => {
    if (ORIGINAL_ENV === undefined) {
      delete process.env.QR_RECONCILE_INTERVAL_MS;
    } else {
      process.env.QR_RECONCILE_INTERVAL_MS = ORIGINAL_ENV;
    }
  });

  describe('webhook', () => {
    it('verifica el cobro del qrId contra BANECO', async () => {
      finances.findQrChargeByQrId.mockResolvedValue(charge('c1', 0));

      await expect(reconciler.reconcileByQrId('qr-c1')).resolves.toBe(true);
      expect(finances.verifyQrCharge).toHaveBeenCalledWith('c1');
    });

    it('un qrId que no es de un presupuesto no hace nada', async () => {
      finances.findQrChargeByQrId.mockResolvedValue(null);

      await expect(reconciler.reconcileByQrId('qr-x')).resolves.toBe(false);
      expect(finances.verifyQrCharge).not.toHaveBeenCalled();
    });
  });

  describe('barrido', () => {
    it('verifica cada pendiente y anula (de forma segura) solo los viejos sin pagar', async () => {
      finances.findPendingQrCharges.mockResolvedValue([
        charge('fresh', 5 * 60_000),
        charge('old', QR_CHARGE_MAX_AGE_MS + 1),
        charge('old-paid', QR_CHARGE_MAX_AGE_MS + 1),
      ]);
      finances.verifyQrCharge.mockImplementation((id: string) =>
        Promise.resolve({ status: id === 'old-paid' ? 'paid' : 'pending' }),
      );

      await reconciler.sweep(NOW);

      expect(finances.verifyQrCharge).toHaveBeenCalledTimes(3);
      expect(finances.cancelQrCharge).toHaveBeenCalledTimes(1);
      expect(finances.cancelQrCharge).toHaveBeenCalledWith('old');
    });

    it('un error con un cobro no corta el resto', async () => {
      finances.findPendingQrCharges.mockResolvedValue([
        charge('broken', 0),
        charge('ok', 0),
      ]);
      finances.verifyQrCharge
        .mockRejectedValueOnce(new Error('BANECO caído'))
        .mockResolvedValueOnce({ status: 'pending' });

      await reconciler.sweep(NOW);

      expect(finances.verifyQrCharge).toHaveBeenCalledWith('ok');
    });

    it('nunca corren dos barridos a la vez', async () => {
      let release: (value: unknown[]) => void = () => undefined;
      finances.findPendingQrCharges.mockReturnValue(
        new Promise((resolve) => {
          release = resolve;
        }),
      );

      const first = reconciler.sweep(NOW);
      await reconciler.sweep(NOW);
      expect(finances.findPendingQrCharges).toHaveBeenCalledTimes(1);

      release([]);
      await first;
      finances.findPendingQrCharges.mockResolvedValue([]);
      await reconciler.sweep(NOW);
      expect(finances.findPendingQrCharges).toHaveBeenCalledTimes(2);
    });
  });

  describe('programación', () => {
    it('registra el intervalo al arrancar y lo saca al apagar', () => {
      delete process.env.QR_RECONCILE_INTERVAL_MS;

      reconciler.onApplicationBootstrap();
      expect(registry.addInterval).toHaveBeenCalledWith(
        'quote-qr-charge-reconcile',
        expect.anything(),
      );
      const [[, interval]] = registry.addInterval.mock.calls as [
        [string, NodeJS.Timeout],
      ];
      clearInterval(interval);

      registry.doesExist.mockReturnValue(true);
      reconciler.onApplicationShutdown();
      expect(registry.deleteInterval).toHaveBeenCalledWith(
        'quote-qr-charge-reconcile',
      );
    });

    it('con QR_RECONCILE_INTERVAL_MS=0 no programa nada', () => {
      process.env.QR_RECONCILE_INTERVAL_MS = '0';

      reconciler.onApplicationBootstrap();
      expect(registry.addInterval).not.toHaveBeenCalled();
      registry.doesExist.mockReturnValue(false);
      reconciler.onApplicationShutdown();
      expect(registry.deleteInterval).not.toHaveBeenCalled();
    });
  });
});
