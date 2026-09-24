import { QuotesController } from './quotes.controller';
import { PatientQuotesController } from './patient-quotes.controller';
import { QuotesService } from '../../application/quotes.service';

describe('controllers de presupuestos', () => {
  const service = {
    findById: jest.fn(),
    addItem: jest.fn(),
    removeItem: jest.fn(),
    addPayment: jest.fn(),
    createForPatient: jest.fn(),
    findByPatient: jest.fn(),
  };

  beforeEach(() => jest.clearAllMocks());

  describe('QuotesController', () => {
    const controller = new QuotesController(
      service as unknown as QuotesService,
    );

    it('findById devuelve el presupuesto', async () => {
      service.findById.mockResolvedValue({ id: 'quote-1' });

      await expect(controller.findById('quote-1')).resolves.toEqual({
        id: 'quote-1',
      });
    });

    it('addItem pasa tratamiento, piezas, precio y cantidad', async () => {
      await controller.addItem('quote-1', {
        treatmentId: 'treatment-1',
        toothNumbers: [16, 17],
        customPrice: 120,
        quantity: 1,
      });

      expect(service.addItem).toHaveBeenCalledWith('quote-1', {
        treatmentId: 'treatment-1',
        toothNumbers: [16, 17],
        customPrice: 120,
        quantity: 1,
      });
    });

    it('removeItem pasa presupuesto e ítem', async () => {
      await controller.removeItem('quote-1', 'item-1');

      expect(service.removeItem).toHaveBeenCalledWith('quote-1', 'item-1');
    });

    it('addPayment pasa monto, medio y notas', async () => {
      await controller.addPayment('quote-1', {
        amount: 50,
        paymentMethod: 'qr',
        notes: 'primer pago',
      });

      expect(service.addPayment).toHaveBeenCalledWith('quote-1', {
        amount: 50,
        paymentMethod: 'qr',
        notes: 'primer pago',
      });
    });
  });

  describe('PatientQuotesController', () => {
    const controller = new PatientQuotesController(
      service as unknown as QuotesService,
    );

    it('create abre un presupuesto para el paciente', async () => {
      await controller.create('patient-1', { notes: 'plan de tratamiento' });

      expect(service.createForPatient).toHaveBeenCalledWith(
        'patient-1',
        'plan de tratamiento',
      );
    });

    it('findByPatient lista sus presupuestos', async () => {
      service.findByPatient.mockResolvedValue([]);

      await expect(controller.findByPatient('patient-1')).resolves.toEqual([]);
      expect(service.findByPatient).toHaveBeenCalledWith('patient-1');
    });
  });
});
