import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes, createHash } from 'node:crypto';
import { INVITE_TTL_DAYS, InviteChannel } from '../domain/PatientInvite.js';
import { PatientInviteRepository } from '../domain/PatientInviteRepository.js';
import type {
  IPatientInviteRepository,
  RedeemedInvite,
} from '../domain/PatientInviteRepository.js';
import { EmailSender } from '../domain/EmailSender.js';
import type { EmailSender as IEmailSender } from '../domain/EmailSender.js';
import { toE164Bolivia } from '../../shared/phone.util.js';

export interface CreateInviteResult {
  whatsappUrl?: string;
}

function hashToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex');
}

function buildWhatsappUrl(phone: string, message: string): string {
  const normalized = toE164Bolivia(phone).slice(1);
  return `https://wa.me/${normalized}?text=${encodeURIComponent(message)}`;
}

@Injectable()
export class PatientInvitesService {
  constructor(
    @Inject(PatientInviteRepository)
    private readonly inviteRepo: IPatientInviteRepository,
    @Inject(EmailSender) private readonly emailSender: IEmailSender,
  ) {}

  async createInvite(
    patientId: string,
    channel: string,
  ): Promise<CreateInviteResult> {
    const contact = await this.inviteRepo.findPatientContactInfo(patientId);
    if (!contact) {
      throw new NotFoundException('Paciente no encontrado');
    }
    if (channel === InviteChannel.EMAIL && !contact.email) {
      throw new ConflictException(
        'El paciente no tiene un email cargado todavía',
      );
    }
    if (channel === InviteChannel.WHATSAPP && !contact.phone) {
      throw new ConflictException(
        'El paciente no tiene un teléfono cargado todavía',
      );
    }

    const rawToken = randomBytes(32).toString('base64url');
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(
      Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000,
    );
    await this.inviteRepo.create({ patientId, channel, tokenHash, expiresAt });

    const frontendUrl = (
      process.env['FRONTEND_URL'] ?? 'http://localhost:4200'
    ).replace(/\/$/, '');
    const inviteUrl = `${frontendUrl}/invitacion/${rawToken}`;

    if (channel === InviteChannel.EMAIL) {
      await this.emailSender.sendInviteEmail({
        to: contact.email!,
        patientDisplayName: contact.fullName,
        inviteUrl,
      });
      return {};
    }

    const message = `Hola ${contact.fullName}, completá tu registro en Clínica Guizada-Aliaga acá: ${inviteUrl}`;
    return { whatsappUrl: buildWhatsappUrl(contact.phone!, message) };
  }

  redeem(rawToken: string): Promise<RedeemedInvite | null> {
    return this.inviteRepo.redeemByTokenHash(hashToken(rawToken), new Date());
  }

  checkStatus(rawToken: string): Promise<boolean> {
    return this.inviteRepo.isTokenValid(hashToken(rawToken), new Date());
  }
}
