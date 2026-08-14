import { Controller, Get, Param } from '@nestjs/common';
import { PatientInvitesService } from '../../application/patient-invites.service.js';

interface InviteStatusResponse {
  valid: boolean;
}

// Sin guard a propósito: lo consulta un visitante sin sesión desde /invitacion/:token,
// antes de decidir si mandarlo a loguearse con Google. Siempre 200 — nunca 401/404,
// para no disparar el redirect global del error.interceptor.ts del frontend.
@Controller('invites')
export class PublicInviteStatusController {
  constructor(private readonly patientInvitesService: PatientInvitesService) {}

  @Get(':token/status')
  async getStatus(
    @Param('token') token: string,
  ): Promise<InviteStatusResponse> {
    const valid = await this.patientInvitesService.checkStatus(token);
    return { valid };
  }
}
