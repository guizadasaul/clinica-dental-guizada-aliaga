import { ServiceUnavailableException } from '@nestjs/common';
import { BanecoPaymentGateway } from './baneco-payment.gateway';
import { BanecoApiError, BanecoClient } from './baneco.client';
import { QrStatus } from '../../domain/PaymentGateway';

describe('BanecoPaymentGateway', () => {
  const client = {
    post: jest.fn(),
    get: jest.fn(),
    delete: jest.fn(),
    encryptField: jest.fn((value: string) => `cifrado(${value})`),
    accountCredit: '1234567890',
    branchCode: undefined as string | undefined,
  };
  let gateway: BanecoPaymentGateway;

  beforeEach(() => {
    jest.clearAllMocks();
    client.branchCode = undefined;
    gateway = new BanecoPaymentGateway(client as unknown as BanecoClient);
  });

  describe('generateQr', () => {
    const params = {
      transactionId: 'appt-1',
      amount: 150,
      description: 'Consulta',
      dueDate: new Date('2026-09-25T18:30:00Z'),
    };

    it('pide un QR de un solo uso, en bolivianos, con la cuenta cifrada', async () => {
      client.post.mockResolvedValue({ qrId: 'qr-1', qrImage: 'base64...' });

      await expect(gateway.generateQr(params)).resolves.toEqual({
        qrId: 'qr-1',
        qrImageBase64: 'base64...',
      });
      expect(client.post).toHaveBeenCalledWith('/api/qrsimple/generateQR', {
        transactionId: 'appt-1',
        accountCredit: 'cifrado(1234567890)',
        currency: 'BOB',
        amount: 150,
        description: 'Consulta',
        dueDate: '2026-09-25',
        singleUse: true,
        modifyAmount: false,
      });
    });

    it('agrega la sucursal solo si está configurada', async () => {
      client.branchCode = '701';
      client.post.mockResolvedValue({ qrId: 'qr-1', qrImage: 'x' });

      await gateway.generateQr(params);

      expect(client.post).toHaveBeenCalledWith(
        '/api/qrsimple/generateQR',
        expect.objectContaining({ branchCode: '701' }),
      );
    });

    it('un error de BANECO se traduce a 503 con su mensaje', async () => {
      client.post.mockRejectedValue(new BanecoApiError('Cuenta inválida', 3));

      await expect(gateway.generateQr(params)).rejects.toThrow(
        new ServiceUnavailableException('Cuenta inválida'),
      );
    });

    it('cualquier otro error se traduce a 503 genérico (nunca 401)', async () => {
      client.post.mockRejectedValue(new TypeError('x is undefined'));

      await expect(gateway.generateQr(params)).rejects.toThrow(
        new ServiceUnavailableException('No se pudo comunicar con BANECO'),
      );
    });
  });

  describe('getQrStatus', () => {
    const payment = {
      qrId: 'qr-1',
      transactionId: 'tx-1',
      paymentDate: '2026-09-24T14:00:00Z',
      currency: 'BOB',
      amount: 150,
      senderName: 'Ana Pérez',
    };

    it.each([
      [0, QrStatus.PENDING],
      [1, QrStatus.PAID],
      [9, QrStatus.CANCELLED],
      [42, QrStatus.PENDING],
    ])('statusQrCode %i → %s', async (statusQrCode, status) => {
      client.get.mockResolvedValue({ statusQrCode, payment: null });

      await expect(gateway.getQrStatus('qr-1')).resolves.toEqual({
        status,
        payment: null,
      });
      expect(client.get).toHaveBeenCalledWith('/api/qrsimple/v2/statusQR/qr-1');
    });

    it.each([
      ['un objeto suelto', payment],
      ['un array de un elemento', [payment]],
    ])('acepta el pago como %s', async (_, paymentField) => {
      client.get.mockResolvedValue({ statusQrCode: 1, payment: paymentField });

      await expect(gateway.getQrStatus('qr-1')).resolves.toEqual({
        status: QrStatus.PAID,
        payment: {
          qrId: 'qr-1',
          transactionId: 'tx-1',
          amount: 150,
          currency: 'BOB',
          paidAt: new Date('2026-09-24T14:00:00Z'),
          senderName: 'Ana Pérez',
        },
      });
    });

    it('un array vacío es "sin pago"', async () => {
      client.get.mockResolvedValue({ statusQrCode: 0, payment: [] });

      await expect(gateway.getQrStatus('qr-1')).resolves.toMatchObject({
        payment: null,
      });
    });

    it('sin fecha ni remitente quedan en null', async () => {
      client.get.mockResolvedValue({
        statusQrCode: 1,
        payment: { ...payment, paymentDate: undefined, senderName: undefined },
      });

      await expect(gateway.getQrStatus('qr-1')).resolves.toMatchObject({
        payment: { paidAt: null, senderName: null },
      });
    });

    it('un error se traduce a 503', async () => {
      client.get.mockRejectedValue(new BanecoApiError('Timeout'));

      await expect(gateway.getQrStatus('qr-1')).rejects.toThrow(
        ServiceUnavailableException,
      );
    });
  });

  describe('cancelQr', () => {
    it('anula el QR', async () => {
      client.delete.mockResolvedValue({ responseCode: 0 });

      await gateway.cancelQr('qr-1');

      expect(client.delete).toHaveBeenCalledWith('/api/qrsimple/cancelQR', {
        qrId: 'qr-1',
      });
    });

    it('un error se traduce a 503', async () => {
      client.delete.mockRejectedValue(new BanecoApiError('QR inexistente'));

      await expect(gateway.cancelQr('qr-1')).rejects.toThrow('QR inexistente');
    });
  });
});
