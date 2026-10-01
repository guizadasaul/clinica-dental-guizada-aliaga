export interface CreateInviteResponse {
  whatsappUrl?: string;
}

/** A quién va dirigida la invitación: define el copy de /invitacion/:token. */
export type InviteKind = 'patient' | 'doctor';

export interface InviteStatusResponse {
  valid: boolean;
  /** Ausente si el token no existe (o el backend es anterior a CLI-79): se trata como paciente. */
  kind?: InviteKind;
  /**
   * Últimos 3 dígitos del teléfono de la ficha (solo con la invitación
   * vigente y si la ficha tiene teléfono): el registro por teléfono solo
   * acepta ese número (CLI-144).
   */
  phoneHint?: string;
}
