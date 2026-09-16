export type InviteEmailKind = 'patient' | 'doctor';

export interface SendInviteEmailParams {
  to: string;
  displayName: string;
  inviteUrl: string;
  kind: InviteEmailKind;
}

/** Mismo patrón que AccessTokenVerifier/PaymentGateway — abstrae el proveedor de email del dominio. */
export interface EmailSender {
  sendInviteEmail(params: SendInviteEmailParams): Promise<void>;
}

export const EmailSender = Symbol('EmailSender');
