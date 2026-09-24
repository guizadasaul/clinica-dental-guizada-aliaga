import { PublicCheckoutController } from './public-checkout.controller';
import { BanecoWebhookController } from './baneco-webhook.controller';
import { PaymentsService } from '../../application/payments.service';

describe('controllers de pagos', () => {
  const service = {
    checkout: jest.fn(),
    getPublicStatus: jest.fn(),
    handleBanecoNotification: jest.fn(),
  };

  beforeEach(() => jest.clearAllMocks());

  describe('PublicCheckoutController', () => {
    const controller = new PublicCheckoutController(
      service as unknown as PaymentsService,
    );

    it('checkout genera el cobro de la cita', async () => {
      service.checkout.mockResolvedValue({ qrImageBase64: 'x' });

      await expect(controller.checkout('appt-1')).resolves.toEqual({
        qrImageBase64: 'x',
      });
      expect(service.checkout).toHaveBeenCalledWith('appt-1');
    });

    it('status consulta el estado público de la cita', async () => {
      service.getPublicStatus.mockResolvedValue({ status: 'held' });

      await expect(controller.getStatus('appt-1')).resolves.toEqual({
        status: 'held',
      });
      expect(service.getPublicStatus).toHaveBeenCalledWith('appt-1');
    });
  });

  describe('BanecoWebhookController', () => {
    const controller = new BanecoWebhookController(
      service as unknown as PaymentsService,
    );

    it('usa solo el qrId para re-verificar el pago y responde OK a BANECO', async () => {
      service.handleBanecoNotification.mockResolvedValue(undefined);

      await expect(
        controller.webhook({ payment: { qrId: 'qr-1' } }),
      ).resolves.toEqual({ responseCode: 0, message: 'OK' });
      expect(service.handleBanecoNotification).toHaveBeenCalledWith('qr-1');
    });

    it('si la re-verificación falla, no responde OK', async () => {
      service.handleBanecoNotification.mockRejectedValue(new Error('503'));

      await expect(
        controller.webhook({ payment: { qrId: 'qr-1' } }),
      ).rejects.toThrow('503');
    });
  });
});
