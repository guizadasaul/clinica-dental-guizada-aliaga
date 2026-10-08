export const InviteChannel = {
  EMAIL: 'email',
  WHATSAPP: 'whatsapp',
} as const;
export type InviteChannel = (typeof InviteChannel)[keyof typeof InviteChannel];

import type { InviteEmailKind } from './EmailSender.js';

/**
 * Vigencia de todos los links de ingreso y recuperación (CLI-255): 24 horas.
 * Invitaciones de paciente (antes 5 minutos) y de doctor (antes 48 horas),
 * correos de confirmación y de recuperación (antes 1 hora; el link real lo
 * corta el "Email OTP Expiration" de Supabase, que tiene que estar en 86400)
 * y el link de WhatsApp para una contraseña nueva (antes 30 minutos). Siguen
 * sirviendo una sola vez.
 */
export const LINK_TTL_MINUTES = 24 * 60;

export const INVITE_TTL_MINUTES: Record<InviteEmailKind, number> = {
  patient: LINK_TTL_MINUTES,
  doctor: LINK_TTL_MINUTES,
};

/** "24 horas", "1 minuto" — para el copy de los mensajes que avisan cuándo vence el link. */
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
