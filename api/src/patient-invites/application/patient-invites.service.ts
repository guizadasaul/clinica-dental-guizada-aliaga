import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes, createHash } from 'node:crypto';
import {
  INVITE_TTL_MINUTES,
  InviteChannel,
  formatInviteTtl,
} from '../domain/PatientInvite.js';
import { PatientInviteRepository } from '../domain/PatientInviteRepository.js';
import type {
  IPatientInviteRepository,
  RedeemedInvite,
} from '../domain/PatientInviteRepository.js';
import { EmailSender } from '../domain/EmailSender.js';
import type {
  EmailSender as IEmailSender,
  InviteEmailKind,
} from '../domain/EmailSender.js';
import { phoneLastDigits, toE164Bolivia } from '../../shared/phone.util.js';

export interface CreateInviteResult {
  whatsappUrl?: string;
}

/** Respuesta pública de /invites/:token/status. Sin `kind` cuando el token no existe. */
export interface InviteStatus {
  valid: boolean;
  kind?: InviteEmailKind;
  /**
   * Últimos 3 dígitos del teléfono de la ficha, solo si la invitación sigue
   * vigente y la ficha tiene teléfono: la landing le dice al invitado con qué
   * número registrarse, sin exponerlo completo a quien tenga el link.
   */
  phoneHint?: string;
}

/** Para validar un registro por teléfono (uso interno, nunca sale por HTTP). */
export interface InviteRegistrationTarget {
  valid: boolean;
  /** Teléfono de la ficha: si está, es el único con el que se puede registrar. */
  phone: string | null;
}

function hashToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex');
}

function buildWhatsappUrl(phone: string, message: string): string {
  const normalized = toE164Bolivia(phone).slice(1);
  return `https://wa.me/${normalized}?text=${encodeURIComponent(message)}`;
}

// WhatsApp no soporta HTML — *negrita* y _cursiva_ son su propio markdown.
// Sin emojis a propósito: wa.me/api.whatsapp.com corrompe a "�" cualquier
// carácter de 3+ bytes en UTF-8 (emojis, ⏳, etc.) al procesar el parámetro
// `text` — verificado navegando directo a api.whatsapp.com/send con una URL
// armada a mano, sin pasar por nuestro código. Los acentos españoles (2
// bytes) sí sobreviven, por eso el resto del mensaje no se ve afectado.
const WHATSAPP_INTRO: Record<InviteEmailKind, string> = {
  patient:
    'Te escribimos del equipo de *Clínica Dental Guizada-Aliaga* para invitarte a completar tu registro. Así vas a poder ver tus citas, tu historial clínico y tus presupuestos, todo desde un solo lugar.',
  doctor:
    'Te escribimos de la administración de *Clínica Dental Guizada-Aliaga* para invitarte a sumarte a nuestro equipo de odontólogos. Vas a poder acceder a tu panel, tu agenda y las fichas de tus pacientes.',
};

const WHATSAPP_CALL_TO_ACTION: Record<InviteEmailKind, string> = {
  patient: 'Completá tu registro acá:',
  doctor: 'Creá tu acceso acá:',
};

function buildWhatsappMessage(
  fullName: string,
  inviteUrl: string,
  kind: InviteEmailKind,
): string {
  return [
    `¡Hola *${fullName}*!`,
    '',
    WHATSAPP_INTRO[kind],
    '',
    WHATSAPP_CALL_TO_ACTION[kind],
    inviteUrl,
    '',
    `_Por tu seguridad, este enlace vence en ${formatInviteTtl(INVITE_TTL_MINUTES[kind])}._`,
  ].join('\n');
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
    return this.buildAndSendInvite({
      userId: contact.userId,
      patientId,
      channel,
      contact,
      kind: 'patient',
    });
  }

  /**
   * Mismo mecanismo que createInvite, generalizado a cualquier user (no solo
   * pacientes) — CLI-63 lo usa para invitar doctores nuevos por email.
   */
  createInviteForUser(
    userId: string,
    channel: string,
    contact: { fullName: string; phone: string | null; email: string | null },
    kind: InviteEmailKind,
  ): Promise<CreateInviteResult> {
    return this.buildAndSendInvite({
      userId,
      patientId: null,
      channel,
      contact,
      kind,
    });
  }

  private async buildAndSendInvite(params: {
    userId: string;
    patientId: string | null;
    channel: string;
    contact: { fullName: string; phone: string | null; email: string | null };
    kind: InviteEmailKind;
  }): Promise<CreateInviteResult> {
    const { userId, patientId, channel, contact, kind } = params;
    const subject = kind === 'doctor' ? 'El doctor' : 'El paciente';
    if (channel === InviteChannel.EMAIL && !contact.email) {
      throw new ConflictException(
        `${subject} no tiene un email cargado todavía`,
      );
    }
    if (channel === InviteChannel.WHATSAPP && !contact.phone) {
      throw new ConflictException(
        `${subject} no tiene un teléfono cargado todavía`,
      );
    }

    const rawToken = randomBytes(32).toString('base64url');
    const tokenHash = hashToken(rawToken);
    const now = new Date();
    const ttlMinutes = INVITE_TTL_MINUTES[kind];
    const expiresAt = new Date(now.getTime() + ttlMinutes * 60 * 1000);
    // Cualquier invite pendiente anterior de este user (mismo canal u
    // otro) muere apenas se manda uno nuevo — nunca conviven dos links
    // válidos en paralelo.
    await this.inviteRepo.invalidatePendingForUser(userId, now);
    await this.inviteRepo.create({
      userId,
      patientId,
      channel,
      tokenHash,
      expiresAt,
    });

    const frontendUrl = (
      process.env['FRONTEND_URL'] ?? 'http://localhost:4200'
    ).replace(/\/$/, '');
    const inviteUrl = `${frontendUrl}/invitacion/${rawToken}`;

    if (channel === InviteChannel.EMAIL) {
      await this.emailSender.sendInviteEmail({
        to: contact.email!,
        displayName: contact.fullName,
        inviteUrl,
        kind,
      });
      return {};
    }

    const message = buildWhatsappMessage(contact.fullName, inviteUrl, kind);
    return { whatsappUrl: buildWhatsappUrl(contact.phone!, message) };
  }

  redeem(rawToken: string): Promise<RedeemedInvite | null> {
    return this.inviteRepo.redeemByTokenHash(hashToken(rawToken), new Date());
  }

  async checkStatus(rawToken: string): Promise<InviteStatus> {
    const status = await this.inviteRepo.findTokenStatus(
      hashToken(rawToken),
      new Date(),
    );
    // Un token que no existe no revela nada: ni siquiera a quién iría dirigido.
    if (!status) {
      return { valid: false };
    }
    return {
      valid: status.valid,
      kind: status.kind,
      ...(status.valid &&
        status.phone && { phoneHint: phoneLastDigits(status.phone) }),
    };
  }

  async registrationTarget(
    rawToken: string,
  ): Promise<InviteRegistrationTarget> {
    const status = await this.inviteRepo.findTokenStatus(
      hashToken(rawToken),
      new Date(),
    );
    return { valid: status?.valid ?? false, phone: status?.phone ?? null };
  }
}
