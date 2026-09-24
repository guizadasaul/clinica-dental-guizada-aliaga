import { PatientInvitesController } from './patient-invites.controller';
import { PatientInvitesService } from '../../application/patient-invites.service';

describe('PatientInvitesController', () => {
  it('crea la invitación del paciente por el canal elegido', async () => {
    const service = {
      createInvite: jest.fn().mockResolvedValue({ link: 'https://...' }),
    };
    const controller = new PatientInvitesController(
      service as unknown as PatientInvitesService,
    );

    await expect(
      controller.createInvite('patient-1', { channel: 'whatsapp' }),
    ).resolves.toEqual({ link: 'https://...' });
    expect(service.createInvite).toHaveBeenCalledWith('patient-1', 'whatsapp');
  });
});
