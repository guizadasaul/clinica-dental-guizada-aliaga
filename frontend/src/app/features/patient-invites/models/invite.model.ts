export interface CreateInviteResponse {
  whatsappUrl?: string;
}

/** A quién va dirigida la invitación: define el copy de /invitacion/:token. */
export type InviteKind = 'patient' | 'doctor';

export interface InviteStatusResponse {
  valid: boolean;
  /** Ausente si el token no existe (o el backend es anterior a CLI-79): se trata como paciente. */
  kind?: InviteKind;
}
