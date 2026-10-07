export type InviteEmailKind = 'patient' | 'doctor';

export interface SendInviteEmailParams {
  to: string;
  displayName: string;
  inviteUrl: string;
  kind: InviteEmailKind;
}

/** Correos de la cuenta que manda el backend en vez de Supabase (CLI-242, CLI-243). */
export type AccountEmailKind = 'confirm_email' | 'reset_password';

export interface SendAccountEmailParams {
  to: string;
  /** null: el saludo va sin nombre. */
  displayName: string | null;
  /** Link de un solo uso a la app (ej. /auth/confirmar?token_hash=…). */
  actionUrl: string;
  kind: AccountEmailKind;
}

/** Mismo patrón que AccessTokenVerifier/PaymentGateway — abstrae el proveedor de email del dominio. */
export interface EmailSender {
  sendInviteEmail(params: SendInviteEmailParams): Promise<void>;
  sendAccountEmail(params: SendAccountEmailParams): Promise<void>;
}

export const EmailSender = Symbol('EmailSender');
