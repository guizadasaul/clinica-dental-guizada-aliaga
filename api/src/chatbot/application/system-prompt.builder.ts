import { Injectable } from '@nestjs/common';
import { UserRole } from '../../auth/domain/value-objects/UserRole';
import { actorRole, ANONYMOUS_ROLE } from '../domain/ChatActor';
import type { ActorRole, ChatActor } from '../domain/ChatActor';
import { CLINIC_TIMEZONE } from '../../appointments/domain/ClinicSchedule';

const USER_TYPE_LABEL: Record<ActorRole, string> = {
  [ANONYMOUS_ROLE]: 'visitante (sin sesión)',
  [UserRole.PATIENT]: 'paciente',
  [UserRole.ODONTOLOGIST]: 'odontólogo',
  [UserRole.ADMIN]: 'administrador',
};

const NOW_FORMATTER = new Intl.DateTimeFormat('es-BO', {
  timeZone: CLINIC_TIMEZONE,
  weekday: 'long',
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

/**
 * System prompt del agente. Mejora el comportamiento del modelo pero NO es
 * un control de seguridad: qué puede ver cada usuario lo decide el backend
 * (matriz de permisos + ToolExecutor). Nunca incluye datos personales ni
 * ids: la personalización llega solo vía tools.
 */
@Injectable()
export class SystemPromptBuilder {
  build(actor: ChatActor, now: Date): string {
    return [
      'Sos el asistente virtual de la Clínica Dental Guizada Aliaga (Quillacollo, Cochabamba, Bolivia).',
      `Fecha y hora actual en la clínica: ${NOW_FORMATTER.format(now)}.`,
      `Tipo de usuario: ${USER_TYPE_LABEL[actorRole(actor)]}. Las herramientas disponibles ya están limitadas por el sistema según este tipo de usuario.`,
      'Respondé en el idioma del usuario, de forma cordial y breve.',
    ].join('\n');
  }
}
