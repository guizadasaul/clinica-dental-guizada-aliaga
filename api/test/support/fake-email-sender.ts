import type {
  EmailSender,
  SendAccountEmailParams,
  SendInviteEmailParams,
} from '../../src/patient-invites/domain/EmailSender';

/** Reemplaza a Resend en los e2e (CLI-242): guarda los correos en memoria. */
export class FakeEmailSender implements EmailSender {
  readonly inviteEmails: SendInviteEmailParams[] = [];
  readonly accountEmails: SendAccountEmailParams[] = [];

  sendInviteEmail(params: SendInviteEmailParams): Promise<void> {
    this.inviteEmails.push(params);
    return Promise.resolve();
  }

  sendAccountEmail(params: SendAccountEmailParams): Promise<void> {
    this.accountEmails.push(params);
    return Promise.resolve();
  }

  reset(): void {
    this.inviteEmails.length = 0;
    this.accountEmails.length = 0;
  }
}
