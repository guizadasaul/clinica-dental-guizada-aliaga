export const InviteChannel = {
  EMAIL: 'email',
  WHATSAPP: 'whatsapp',
} as const;
export type InviteChannel = (typeof InviteChannel)[keyof typeof InviteChannel];

import type { InviteEmailKind } from './EmailSender.js';

/**
 * Cuánto vive una invitación según a quién va dirigida. El paciente la recibe
 * en el consultorio y la usa al momento (5 min); el doctor la recibe a
 * distancia, de parte del administrador, y necesita margen (48 h). En los dos
 * casos sigue siendo de un solo uso y reenviar invalida la anterior.
 */
export const INVITE_TTL_MINUTES: Record<InviteEmailKind, number> = {
  patient: 5,
  doctor: 48 * 60,
};

/** "5 minutos", "48 horas" — para el copy de los mensajes que avisan cuándo vence el link. */
export function formatInviteTtl(minutes: number): string {
  if (minutes >= 60 && minutes % 60 === 0) {
    const hours = minutes / 60;
    return hours === 1 ? '1 hora' : `${hours} horas`;
  }
  return minutes === 1 ? '1 minuto' : `${minutes} minutos`;
}

export class PatientInvite {
  constructor(
    readonly id: string,
    readonly userId: string,
    readonly patientId: string | null,
    readonly channel: string,
    readonly expiresAt: Date,
    readonly usedAt: Date | null,
    readonly createdAt: Date,
  ) {}

  isRedeemable(now: Date = new Date()): boolean {
    return this.usedAt === null && this.expiresAt.getTime() > now.getTime();
  }
}
