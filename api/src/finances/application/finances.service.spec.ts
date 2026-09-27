import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { FinancesService } from './finances.service';
import type { QuotesService } from '../../quotes/application/quotes.service';
import type { IQuoteRepository } from '../../quotes/domain/QuoteRepository';
import type { Quote } from '../../quotes/domain/Quote';
import type { QrCharge } from '../../quotes/domain/QrCharge';

const NOW = new Date('2026-09-27T12:00:00Z');

function quote(overrides: Partial<Quote> = {}): Quote {
  return {
    id: 'quote-1',
    patientId: 'patient-1',
    totalAmount: 700,
    totalPaid: 200,
    balance: 500,
    status: 'partially_paid',
    notes: null,
    createdAt: NOW,
    updatedAt: NOW,
    sharedAt: null,
    items: [],
    payments: [],
    ...overrides,
  };
}

function charge(overrides: Partial<QrCharge> = {}): QrCharge {
  return {
    id: 'charge-1',
    quoteId: 'quote-1',
    amount: 150,
    qrId: 'qr-1',
    transactionId: 'tx-1',
    qrImageBase64: 'img',
    status: 'pending',
    paymentId: null,
    createdAt: NOW,
    ...overrides,
  };
}

describe('FinancesService', () => {
  const quotesService = { findByPatient: jest.fn(), findById: jest.fn() };
  const quoteRepo = {
    createQrCharge: jest.fn(),
    findQrCharge: jest.fn(),
    settleQrCharge: jest.fn(),
    cancelQrCharge: jest.fn(),
  };
  const readRepo = {
    listPatientsWithBalance: jest.fn(),
    findPatientName: jest.fn(),
  };
  const gateway = {
    generateQr: jest.fn(),
    getQrStatus: jest.fn(),
    cancelQr: jest.fn(),
  };
  const service = new FinancesService(
    quotesService as unknown as QuotesService,
    quoteRepo as unknown as IQuoteRepository,
    readRepo,
    gateway,
  );

  beforeEach(() => jest.clearAllMocks());

  it('listPatients delega la búsqueda', async () => {
    readRepo.listPatientsWithBalance.mockResolvedValue([]);

    await expect(service.listPatients('ana')).resolves.toEqual([]);
    expect(readRepo.listPatientsWithBalance).toHaveBeenCalledWith('ana');
  });

  describe('getPatientDetail', () => {
    it('404 si el paciente no existe', async () => {
      readRepo.findPatientName.mockResolvedValue(null);

      await expect(service.getPatientDetail('missing')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('elige el presupuesto activo aunque haya uno pagado más nuevo', async () => {
      readRepo.findPatientName.mockResolvedValue('Ana Pérez');
      const active = quote({ id: 'active' });
      quotesService.findByPatient.mockResolvedValue([
        quote({ id: 'paid', status: 'paid' }),
        active,
      ]);

      await expect(service.getPatientDetail('patient-1')).resolves.toEqual({
        patientId: 'patient-1',
        patientName: 'Ana Pérez',
        quote: active,
      });
    });

    it('sin activo usa el más reciente; sin presupuestos, null', async () => {
      readRepo.findPatientName.mockResolvedValue('Ana Pérez');
      const paid = quote({ id: 'paid', status: 'paid' });
      quotesService.findByPatient
        .mockResolvedValueOnce([paid])
        .mockResolvedValueOnce([]);

      expect((await service.getPatientDetail('patient-1')).quote).toBe(paid);
      expect((await service.getPatientDetail('patient-1')).quote).toBeNull();
    });
  });

  describe('createQrCharge', () => {
    it('genera el QR en BANECO y guarda el cobro', async () => {
      quotesService.findById.mockResolvedValue(quote());
      gateway.generateQr.mockResolvedValue({
        qrId: 'qr-1',
        qrImageBase64: 'img',
      });
      quoteRepo.createQrCharge.mockResolvedValue(charge());

      await expect(service.createQrCharge('quote-1', 150)).resolves.toEqual({
        chargeId: 'charge-1',
        quoteId: 'quote-1',
        amount: 150,
        qrImageBase64: 'img',
        status: 'pending',
      });

      const [[params]] = gateway.generateQr.mock.calls as [
        [{ transactionId: string; amount: number }],
      ];
      expect(params.amount).toBe(150);
      expect(params.transactionId).toMatch(/^CGA-Q-quote-1-/);
      expect(quoteRepo.createQrCharge).toHaveBeenCalledWith({
        quoteId: 'quote-1',
        amount: 150,
        qrId: 'qr-1',
        transactionId: params.transactionId,
        qrImageBase64: 'img',
      });
    });

    it('400 si el monto supera el saldo, sin llamar a BANECO', async () => {
      quotesService.findById.mockResolvedValue(quote({ balance: 100 }));

      await expect(service.createQrCharge('quote-1', 150)).rejects.toThrow(
        BadRequestException,
      );
      expect(gateway.generateQr).not.toHaveBeenCalled();
    });
  });

  describe('verifyQrCharge', () => {
    it('404 si el cobro no existe', async () => {
      quoteRepo.findQrCharge.mockResolvedValue(null);

      await expect(service.verifyQrCharge('missing')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('ya pagado: devuelve el presupuesto sin consultar a BANECO', async () => {
      quoteRepo.findQrCharge.mockResolvedValue(charge({ status: 'paid' }));
      quotesService.findById.mockResolvedValue(quote());

      await expect(service.verifyQrCharge('charge-1')).resolves.toEqual({
        status: 'paid',
        quote: quote(),
      });
      expect(gateway.getQrStatus).not.toHaveBeenCalled();
      expect(quoteRepo.settleQrCharge).not.toHaveBeenCalled();
    });

    it('ya anulado: responde anulado sin consultar a BANECO', async () => {
      quoteRepo.findQrCharge.mockResolvedValue(charge({ status: 'cancelled' }));

      await expect(service.verifyQrCharge('charge-1')).resolves.toEqual({
        status: 'cancelled',
      });
      expect(gateway.getQrStatus).not.toHaveBeenCalled();
    });

    it('BANECO todavía sin pago: sigue pendiente', async () => {
      quoteRepo.findQrCharge.mockResolvedValue(charge());
      gateway.getQrStatus.mockResolvedValue({
        status: 'pending',
        payment: null,
      });

      await expect(service.verifyQrCharge('charge-1')).resolves.toEqual({
        status: 'pending',
      });
      expect(gateway.getQrStatus).toHaveBeenCalledWith('qr-1');
      expect(quoteRepo.settleQrCharge).not.toHaveBeenCalled();
    });

    it('BANECO lo anuló: se anula acá también', async () => {
      quoteRepo.findQrCharge.mockResolvedValue(charge());
      gateway.getQrStatus.mockResolvedValue({
        status: 'cancelled',
        payment: null,
      });

      await expect(service.verifyQrCharge('charge-1')).resolves.toEqual({
        status: 'cancelled',
      });
      expect(quoteRepo.cancelQrCharge).toHaveBeenCalledWith('charge-1');
    });

    it('pagado en BANECO: registra el pago una sola vez', async () => {
      quoteRepo.findQrCharge.mockResolvedValue(charge());
      gateway.getQrStatus.mockResolvedValue({ status: 'paid', payment: null });
      const updated = quote({ totalPaid: 350, balance: 350 });
      quoteRepo.settleQrCharge.mockResolvedValue(updated);

      await expect(service.verifyQrCharge('charge-1')).resolves.toEqual({
        status: 'paid',
        quote: updated,
      });
      expect(quoteRepo.settleQrCharge).toHaveBeenCalledWith('charge-1');
    });

    it('si otra verificación simultánea ya lo registró, devuelve el presupuesto actual', async () => {
      quoteRepo.findQrCharge.mockResolvedValue(charge());
      gateway.getQrStatus.mockResolvedValue({ status: 'paid', payment: null });
      quoteRepo.settleQrCharge.mockResolvedValue(null);
      quotesService.findById.mockResolvedValue(quote());

      await expect(service.verifyQrCharge('charge-1')).resolves.toEqual({
        status: 'paid',
        quote: quote(),
      });
    });
  });

  describe('cancelQrCharge', () => {
    it('anula en BANECO y acá', async () => {
      quoteRepo.findQrCharge.mockResolvedValue(charge());

      await service.cancelQrCharge('charge-1');

      expect(gateway.cancelQr).toHaveBeenCalledWith('qr-1');
      expect(quoteRepo.cancelQrCharge).toHaveBeenCalledWith('charge-1');
    });

    it('409 si ya se pagó', async () => {
      quoteRepo.findQrCharge.mockResolvedValue(charge({ status: 'paid' }));

      await expect(service.cancelQrCharge('charge-1')).rejects.toThrow(
        ConflictException,
      );
      expect(gateway.cancelQr).not.toHaveBeenCalled();
    });

    it('ya anulado: no hace nada', async () => {
      quoteRepo.findQrCharge.mockResolvedValue(charge({ status: 'cancelled' }));

      await service.cancelQrCharge('charge-1');

      expect(gateway.cancelQr).not.toHaveBeenCalled();
      expect(quoteRepo.cancelQrCharge).not.toHaveBeenCalled();
    });
  });
});
