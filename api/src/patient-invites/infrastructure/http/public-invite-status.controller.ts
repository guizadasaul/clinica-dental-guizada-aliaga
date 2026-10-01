import { Controller, Get, Param } from '@nestjs/common';
import {
  InviteStatus,
  PatientInvitesService,
} from '../../application/patient-invites.service.js';

// Sin guard a propósito: lo consulta un visitante sin sesión desde /invitacion/:token,
// antes de decidir si mandarlo a loguearse con Google. Siempre 200 — nunca 401/404,
// para no disparar el redirect global del error.interceptor.ts del frontend.
// Solo expone `valid`, `kind` (paciente o doctor; solo si el token existe,
// CLI-79, para que la landing use el copy correcto) y `phoneHint`: los últimos
// 3 dígitos del teléfono de la ficha, solo con la invitación vigente, para
// decirle al invitado con qué número registrarse (CLI-144). Nunca el número
// completo ni otro dato personal.
@Controller('invites')
export class PublicInviteStatusController {
  constructor(private readonly patientInvitesService: PatientInvitesService) {}

  @Get(':token/status')
  getStatus(@Param('token') token: string): Promise<InviteStatus> {
    return this.patientInvitesService.checkStatus(token);
  }
}
