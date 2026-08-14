export const InviteChannel = {
  EMAIL: 'email',
  WHATSAPP: 'whatsapp',
} as const;
export type InviteChannel = (typeof InviteChannel)[keyof typeof InviteChannel];

export const INVITE_TTL_DAYS = 30;

export class PatientInvite {
  constructor(
    readonly id: string,
    readonly patientId: string,
    readonly channel: string,
    readonly expiresAt: Date,
    readonly usedAt: Date | null,
    readonly createdAt: Date,
  ) {}

  isRedeemable(now: Date = new Date()): boolean {
    return this.usedAt === null && this.expiresAt.getTime() > now.getTime();
  }
}
