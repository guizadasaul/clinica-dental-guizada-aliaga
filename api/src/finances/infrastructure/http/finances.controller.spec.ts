import { FinancesController } from './finances.controller';
import type { FinancesService } from '../../application/finances.service';

describe('FinancesController', () => {
  const service = {
    listPatients: jest.fn(),
    getPatientDetail: jest.fn(),
    createQrCharge: jest.fn(),
    verifyQrCharge: jest.fn(),
    cancelQrCharge: jest.fn(),
  };
  const controller = new FinancesController(
    service as unknown as FinancesService,
  );

  beforeEach(() => jest.clearAllMocks());

  it('listPatients pasa la búsqueda', async () => {
    service.listPatients.mockResolvedValue([]);

    await expect(controller.listPatients({ search: 'ana' })).resolves.toEqual(
      [],
    );
    expect(service.listPatients).toHaveBeenCalledWith('ana');
  });

  it('getPatientDetail', async () => {
    await controller.getPatientDetail('patient-1');

    expect(service.getPatientDetail).toHaveBeenCalledWith('patient-1');
  });

  it('createQrCharge pasa el monto', async () => {
    await controller.createQrCharge('quote-1', { amount: 150 });

    expect(service.createQrCharge).toHaveBeenCalledWith('quote-1', 150);
  });

  it('verifyQrCharge y cancelQrCharge', async () => {
    await controller.verifyQrCharge('charge-1');
    await controller.cancelQrCharge('charge-1');

    expect(service.verifyQrCharge).toHaveBeenCalledWith('charge-1');
    expect(service.cancelQrCharge).toHaveBeenCalledWith('charge-1');
  });
});
