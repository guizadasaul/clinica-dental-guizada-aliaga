import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
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
    lines: [],
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
    lines: [],
    ...overrides,
  };
}

describe('FinancesService', () => {
  const quotesService = { findByPatient: jest.fn(), findById: jest.fn() };
  const quoteRepo = {
    createQrCharge: jest.fn(),
    findQrCharge: jest.fn(),
    findById: jest.fn(),
    findPendingPatientQrCharge: jest.fn(),
    findPendingQrCharges: jest.fn(),
    findQrChargeByQrId: jest.fn(),
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

  beforeEach(() => jest.resetAllMocks());

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
        lines: [],
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
        lines: undefined,
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

  // CLI-220: anular nunca pierde un pago.
  describe('cancelQrCharge (anulación segura)', () => {
    const paidStatus = (amount = 150) => ({
      status: 'paid' as const,
      payment: { amount } as never,
    });

    beforeEach(() => {
      quoteRepo.findQrCharge.mockResolvedValue(charge());
      quotesService.findById.mockResolvedValue(quote());
      quoteRepo.settleQrCharge.mockResolvedValue(quote({ totalPaid: 350 }));
      quoteRepo.cancelQrCharge.mockResolvedValue(true);
      gateway.cancelQr.mockResolvedValue(undefined);
    });

    it('pendiente en BANECO: lo anula allá y después acá', async () => {
      gateway.getQrStatus.mockResolvedValue({
        status: 'pending',
        payment: null,
      });

      await expect(service.cancelQrCharge('charge-1')).resolves.toEqual({
        status: 'cancelled',
      });

      expect(gateway.cancelQr).toHaveBeenCalledWith('qr-1');
      expect(quoteRepo.cancelQrCharge).toHaveBeenCalledWith('charge-1');
      expect(quoteRepo.settleQrCharge).not.toHaveBeenCalled();
    });

    it('si BANECO ya lo cobró, registra el pago y NO lo anula', async () => {
      gateway.getQrStatus.mockResolvedValue(paidStatus());

      await expect(service.cancelQrCharge('charge-1')).resolves.toEqual({
        status: 'paid',
        quote: quote({ totalPaid: 350 }),
      });

      expect(quoteRepo.settleQrCharge).toHaveBeenCalledWith('charge-1');
      expect(gateway.cancelQr).not.toHaveBeenCalled();
      expect(quoteRepo.cancelQrCharge).not.toHaveBeenCalled();
    });

    it('si se pagó justo mientras se anulaba (BANECO rechaza la anulación), registra el pago', async () => {
      gateway.getQrStatus
        .mockResolvedValueOnce({ status: 'pending', payment: null })
        .mockResolvedValueOnce(paidStatus());
      gateway.cancelQr.mockRejectedValue(new ServiceUnavailableException('no'));

      await expect(service.cancelQrCharge('charge-1')).resolves.toMatchObject({
        status: 'paid',
      });

      expect(quoteRepo.settleQrCharge).toHaveBeenCalledWith('charge-1');
      expect(quoteRepo.cancelQrCharge).not.toHaveBeenCalled();
    });

    it('si BANECO falla al anular y sigue pendiente, el error sube y NO se marca anulado', async () => {
      gateway.getQrStatus.mockResolvedValue({
        status: 'pending',
        payment: null,
      });
      gateway.cancelQr.mockRejectedValue(new ServiceUnavailableException('no'));

      await expect(service.cancelQrCharge('charge-1')).rejects.toThrow(
        ServiceUnavailableException,
      );

      expect(quoteRepo.cancelQrCharge).not.toHaveBeenCalled();
      expect(quoteRepo.settleQrCharge).not.toHaveBeenCalled();
    });

    it('si BANECO no responde ni para consultar, no toca nada', async () => {
      gateway.getQrStatus.mockRejectedValue(
        new ServiceUnavailableException('no'),
      );

      await expect(service.cancelQrCharge('charge-1')).rejects.toThrow(
        ServiceUnavailableException,
      );

      expect(gateway.cancelQr).not.toHaveBeenCalled();
      expect(quoteRepo.cancelQrCharge).not.toHaveBeenCalled();
    });

    it('anulado en BANECO: lo marca anulado acá sin volver a anular', async () => {
      gateway.getQrStatus.mockResolvedValue({
        status: 'cancelled',
        payment: null,
      });

      await expect(service.cancelQrCharge('charge-1')).resolves.toEqual({
        status: 'cancelled',
      });

      expect(gateway.cancelQr).not.toHaveBeenCalled();
      expect(quoteRepo.cancelQrCharge).toHaveBeenCalledWith('charge-1');
    });

    it('pagado con un monto distinto: ni lo registra ni lo anula, y pide revisión', async () => {
      gateway.getQrStatus.mockResolvedValue(paidStatus(100));

      await expect(service.cancelQrCharge('charge-1')).rejects.toThrow(
        ConflictException,
      );

      expect(quoteRepo.settleQrCharge).not.toHaveBeenCalled();
      expect(gateway.cancelQr).not.toHaveBeenCalled();
      expect(quoteRepo.cancelQrCharge).not.toHaveBeenCalled();
    });

    it('ya pagado acá: devuelve el presupuesto sin ir a BANECO', async () => {
      quoteRepo.findQrCharge.mockResolvedValue(charge({ status: 'paid' }));

      await expect(service.cancelQrCharge('charge-1')).resolves.toEqual({
        status: 'paid',
        quote: quote(),
      });
      expect(gateway.getQrStatus).not.toHaveBeenCalled();
    });

    it('ya anulado acá: no hace nada', async () => {
      quoteRepo.findQrCharge.mockResolvedValue(charge({ status: 'cancelled' }));

      await expect(service.cancelQrCharge('charge-1')).resolves.toEqual({
        status: 'cancelled',
      });
      expect(gateway.getQrStatus).not.toHaveBeenCalled();
      expect(gateway.cancelQr).not.toHaveBeenCalled();
    });

    it('si otra request lo registró como pagado mientras se anulaba, devuelve pagado', async () => {
      gateway.getQrStatus.mockResolvedValue({
        status: 'pending',
        payment: null,
      });
      quoteRepo.cancelQrCharge.mockResolvedValue(false);
      quoteRepo.findQrCharge
        .mockResolvedValueOnce(charge())
        .mockResolvedValueOnce(charge({ status: 'paid' }));

      await expect(service.cancelQrCharge('charge-1')).resolves.toMatchObject({
        status: 'paid',
      });
    });

    it('verificar un pago con monto distinto no lo registra: sigue pendiente', async () => {
      gateway.getQrStatus.mockResolvedValue(paidStatus(149));

      await expect(service.verifyQrCharge('charge-1')).resolves.toEqual({
        status: 'pending',
      });
      expect(quoteRepo.settleQrCharge).not.toHaveBeenCalled();
    });

    it('expone los pendientes y la búsqueda por qrId para la conciliación', async () => {
      quoteRepo.findPendingQrCharges.mockResolvedValue([charge()]);
      quoteRepo.findQrChargeByQrId.mockResolvedValue(charge());

      await expect(service.findPendingQrCharges()).resolves.toEqual([charge()]);
      await expect(service.findQrChargeByQrId('qr-1')).resolves.toEqual(
        charge(),
      );
      expect(quoteRepo.findQrChargeByQrId).toHaveBeenCalledWith('qr-1');
    });
  });

  // CLI-218: el paciente paga con QR los tratamientos que elige.
  describe('QR del paciente', () => {
    const shared = (overrides: Partial<Quote> = {}) =>
      quote({
        sharedAt: NOW,
        items: [
          { id: 'item-1', applicationGroupId: null } as Quote['items'][number],
          {
            id: 'item-2',
            applicationGroupId: 'group-1',
          } as Quote['items'][number],
          {
            id: 'item-3',
            applicationGroupId: 'group-1',
          } as Quote['items'][number],
        ],
        lines: [
          {
            key: 'item-1',
            treatmentName: 'Resina',
            toothNumbers: [16],
            total: 300,
            paid: 0,
            pending: 300,
          },
          {
            key: 'group-1',
            treatmentName: 'Corona',
            toothNumbers: [21, 22],
            total: 400,
            paid: 199.5,
            pending: 200.5,
          },
          {
            key: 'item-9',
            treatmentName: 'Limpieza',
            toothNumbers: [],
            total: 200,
            paid: 200,
            pending: 0,
          },
        ],
        ...overrides,
      });

    beforeEach(() => {
      gateway.generateQr.mockResolvedValue({
        qrId: 'qr-1',
        qrImageBase64: 'img',
      });
      quoteRepo.findPendingPatientQrCharge.mockResolvedValue(null);
      quoteRepo.createQrCharge.mockImplementation((data: { lines: unknown }) =>
        Promise.resolve(
          charge({ amount: 500.5, lines: data.lines as QrCharge['lines'] }),
        ),
      );
    });

    it('genera el QR por todo lo pendiente de los tratamientos elegidos, fila o grupo', async () => {
      quoteRepo.findById.mockResolvedValue(shared());

      await service.createPatientQrCharge('patient-1', 'quote-1', [
        'item-1',
        'group-1',
        'item-1',
      ]);

      const [[params]] = gateway.generateQr.mock.calls as [
        [{ amount: number }],
      ];
      expect(params.amount).toBe(500.5);
      expect(quoteRepo.createQrCharge).toHaveBeenCalledWith(
        expect.objectContaining({
          quoteId: 'quote-1',
          amount: 500.5,
          lines: [
            { quoteItemId: 'item-1', amount: 300 },
            { applicationGroupId: 'group-1', amount: 200.5 },
          ],
        }),
      );
    });

    it.each([
      ['no existe', null],
      ['es de otro paciente', { patientId: 'patient-2' }],
      ['todavía es un borrador', { sharedAt: null }],
    ])('404 si el presupuesto %s', async (_case, overrides) => {
      quoteRepo.findById.mockResolvedValue(
        overrides === null ? null : shared(overrides),
      );

      await expect(
        service.createPatientQrCharge('patient-1', 'quote-1', ['item-1']),
      ).rejects.toThrow(NotFoundException);
      expect(gateway.generateQr).not.toHaveBeenCalled();
    });

    it('409 si ya tiene un QR pendiente', async () => {
      quoteRepo.findById.mockResolvedValue(shared());
      quoteRepo.findPendingPatientQrCharge.mockResolvedValue(charge());

      await expect(
        service.createPatientQrCharge('patient-1', 'quote-1', ['item-1']),
      ).rejects.toThrow(ConflictException);
    });

    it.each([
      ['un tratamiento que no está en el presupuesto', ['item-1', 'otro']],
      ['un tratamiento ya pagado', ['item-9']],
    ])('422 si elige %s', async (_case, keys) => {
      quoteRepo.findById.mockResolvedValue(shared());

      await expect(
        service.createPatientQrCharge('patient-1', 'quote-1', keys),
      ).rejects.toThrow(UnprocessableEntityException);
      expect(gateway.generateQr).not.toHaveBeenCalled();
    });

    it('devuelve el QR pendiente para retomarlo, o null', async () => {
      quoteRepo.findPendingPatientQrCharge
        .mockResolvedValueOnce(
          charge({ lines: [{ lineKey: 'item-1', amount: 150 }] }),
        )
        .mockResolvedValueOnce(null);

      await expect(
        service.getPendingPatientQrCharge('patient-1'),
      ).resolves.toMatchObject({
        chargeId: 'charge-1',
        lines: [{ lineKey: 'item-1', amount: 150 }],
      });
      await expect(
        service.getPendingPatientQrCharge('patient-1'),
      ).resolves.toBeNull();
    });

    it('verifica y anula solo QR de sus propios presupuestos', async () => {
      quoteRepo.findQrCharge.mockResolvedValue(charge());
      quoteRepo.findById.mockResolvedValue(shared());
      gateway.getQrStatus.mockResolvedValue({ status: 'pending' });

      await expect(
        service.verifyPatientQrCharge('patient-1', 'charge-1'),
      ).resolves.toEqual({
        status: 'pending',
      });
      await service.cancelPatientQrCharge('patient-1', 'charge-1');
      expect(gateway.cancelQr).toHaveBeenCalledWith('qr-1');

      await expect(
        service.verifyPatientQrCharge('patient-2', 'charge-1'),
      ).rejects.toThrow(NotFoundException);
      await expect(
        service.cancelPatientQrCharge('patient-2', 'charge-1'),
      ).rejects.toThrow(NotFoundException);
      quoteRepo.findQrCharge.mockResolvedValue(null);
      await expect(
        service.verifyPatientQrCharge('patient-1', 'missing'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
