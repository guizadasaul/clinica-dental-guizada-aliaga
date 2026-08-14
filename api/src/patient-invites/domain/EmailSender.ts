export interface SendInviteEmailParams {
  to: string;
  patientDisplayName: string;
  inviteUrl: string;
}

/** Mismo patrón que AccessTokenVerifier/PaymentGateway — abstrae el proveedor de email del dominio. */
export interface EmailSender {
  sendInviteEmail(params: SendInviteEmailParams): Promise<void>;
}

export const EmailSender = Symbol('EmailSender');
