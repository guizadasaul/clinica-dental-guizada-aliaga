import { PublicInviteStatusController } from './public-invite-status.controller';
import { PatientInvitesService } from '../../application/patient-invites.service';

describe('PublicInviteStatusController', () => {
  let controller: PublicInviteStatusController;
  const mockService = { checkStatus: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new PublicInviteStatusController(
      mockService as unknown as PatientInvitesService,
    );
  });

  // CLI-79: la landing necesita saber si el link es de un doctor o de un paciente.
  it('returns valid and kind for a pending doctor invite', async () => {
    mockService.checkStatus.mockResolvedValue({ valid: true, kind: 'doctor' });

    expect(await controller.getStatus('token-doctor')).toEqual({
      valid: true,
      kind: 'doctor',
    });
    expect(mockService.checkStatus).toHaveBeenCalledWith('token-doctor');
  });

  it('returns valid and kind for a pending patient invite', async () => {
    mockService.checkStatus.mockResolvedValue({ valid: true, kind: 'patient' });

    expect(await controller.getStatus('token-patient')).toEqual({
      valid: true,
      kind: 'patient',
    });
  });

  it('returns only { valid: false } for an unknown token, never a 404 (the global interceptor would redirect)', async () => {
    mockService.checkStatus.mockResolvedValue({ valid: false });

    const result = await controller.getStatus('nope');

    expect(result).toEqual({ valid: false });
    expect(result).not.toHaveProperty('kind');
  });
});
