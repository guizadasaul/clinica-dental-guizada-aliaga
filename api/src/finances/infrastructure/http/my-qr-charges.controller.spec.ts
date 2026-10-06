import { MyQrChargesController } from './my-qr-charges.controller';
import type { FinancesService } from '../../application/finances.service';
import type { PatientsService } from '../../../patients/application/patients.service';
import type { AuthenticatedUser } from '../../../auth/domain/AuthenticatedUser';
import { UserRole } from '../../../auth/domain/value-objects/UserRole';
import { ROLES_KEY } from '../../../auth/infrastructure/roles.decorator';

describe('MyQrChargesController (CLI-218)', () => {
  const patientsService = { findMyPatient: jest.fn() };
  const financesService = {
    createPatientQrCharge: jest.fn(),
    getPendingPatientQrCharge: jest.fn(),
    verifyPatientQrCharge: jest.fn(),
    cancelPatientQrCharge: jest.fn(),
  };
  const controller = new MyQrChargesController(
    patientsService as unknown as PatientsService,
    financesService as unknown as FinancesService,
  );
  const user = { uid: 'auth-1' } as AuthenticatedUser;

  beforeEach(() => {
    jest.clearAllMocks();
    patientsService.findMyPatient.mockResolvedValue({ id: 'patient-1' });
  });

  it('solo lo usa el rol paciente', () => {
    expect(Reflect.getMetadata(ROLES_KEY, MyQrChargesController)).toEqual([
      UserRole.PATIENT,
    ]);
  });

  it('el paciente sale siempre de la sesión', async () => {
    financesService.createPatientQrCharge.mockResolvedValue('qr');
    financesService.getPendingPatientQrCharge.mockResolvedValue(null);
    financesService.verifyPatientQrCharge.mockResolvedValue({
      status: 'pending',
    });

    await expect(
      controller.create(user, 'quote-1', { lineKeys: ['item-1'] }),
    ).resolves.toBe('qr');
    await expect(controller.findPending(user)).resolves.toBeNull();
    await expect(controller.verify(user, 'charge-1')).resolves.toEqual({
      status: 'pending',
    });
    await controller.cancel(user, 'charge-1');

    expect(patientsService.findMyPatient).toHaveBeenCalledWith('auth-1');
    expect(financesService.createPatientQrCharge).toHaveBeenCalledWith(
      'patient-1',
      'quote-1',
      ['item-1'],
    );
    expect(financesService.getPendingPatientQrCharge).toHaveBeenCalledWith(
      'patient-1',
    );
    expect(financesService.verifyPatientQrCharge).toHaveBeenCalledWith(
      'patient-1',
      'charge-1',
    );
    expect(financesService.cancelPatientQrCharge).toHaveBeenCalledWith(
      'patient-1',
      'charge-1',
    );
  });
});
