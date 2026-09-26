import { createHash, randomInt } from 'node:crypto';
import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { parsePhoneNumberFromString } from 'libphonenumber-js';
import { ChannelIdentityRepository } from '../domain/ChannelIdentity';
import type {
  ChannelIdentityRepository as IChannelIdentityRepository,
  LinkableChannel,
} from '../domain/ChannelIdentity';
import { CLINIC_WHATSAPP } from '../domain/ClinicContacts';
import { readEnvInt } from '../../shared/env.util';

export const LINK_CODE_DIGITS = 6;
export const DEFAULT_LINK_CODE_TTL_MINUTES = 10;
export const MAX_FAILED_ATTEMPTS_PER_HOUR = 5;
/** Comando que el usuario manda desde WhatsApp: "VINCULAR 123456". */
export const LINK_COMMAND = 'VINCULAR';
const HOUR_MS = 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;
const MAX_CODE_GENERATION_TRIES = 5;

export interface LinkCodeIssued {
  code: string;
  expiresAt: Date;
  /** Texto exacto a enviar, y a qué número. */
  command: string;
  sendTo: string;
}

/**
 * Resultado del canje. Las respuestas al usuario del canal son genéricas
 * (el adaptador no distingue "vencido" de "incorrecto"), sin enumeración.
 */
export type LinkRedeemResult =
  | { status: 'linked'; userId: string; previousUserId: string | null }
  | { status: 'invalid_code' }
  | { status: 'rate_limited' }
  | { status: 'invalid_number' };

export interface ChannelLinkView {
  id: string;
  channel: LinkableChannel;
  /** Solo los últimos dígitos: "•••• 4567". */
  number: string;
  verifiedAt: Date;
}

export function hashLinkCode(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}

/** E.164 de un número tal como lo manda el proveedor ("59171234567" o "+591…"); null si no es válido. */
export function normalizeExternalNumber(raw: string): string | null {
  const digits = raw.replace(/\D/g, '');
  const parsed = parsePhoneNumberFromString(`+${digits}`);
  return parsed?.isValid() ? parsed.number : null;
}

function maskNumber(e164: string): string {
  return `•••• ${e164.slice(-4)}`;
}

/**
 * Vinculación de un número de WhatsApp con una cuenta (CLI-100). La prueba es
 * doble: el código lo pide un usuario con sesión web (identidad) y se canjea
 * con un mensaje enviado desde el número (posesión). Tiene prioridad sobre el
 * reconocimiento por el teléfono de la ficha (CLI-146) y es la salida cuando
 * ese número lo comparten varias cuentas.
 */
@Injectable()
export class ChannelLinkingService {
  private readonly logger = new Logger(ChannelLinkingService.name);

  constructor(
    @Inject(ChannelIdentityRepository)
    private readonly repo: IChannelIdentityRepository,
  ) {}

  async requestCode(
    userId: string,
    channel: LinkableChannel,
    now: Date = new Date(),
  ): Promise<LinkCodeIssued> {
    const ttlMinutes = readEnvInt(
      'CHAT_LINK_CODE_TTL_MINUTES',
      DEFAULT_LINK_CODE_TTL_MINUTES,
    );
    const expiresAt = new Date(now.getTime() + ttlMinutes * MINUTE_MS);
    for (let i = 0; i < MAX_CODE_GENERATION_TRIES; i++) {
      const code = randomInt(0, 10 ** LINK_CODE_DIGITS)
        .toString()
        .padStart(LINK_CODE_DIGITS, '0');
      const codeHash = hashLinkCode(code);
      // Dos códigos vigentes iguales harían ambiguo el canje.
      if (await this.repo.hasActiveLinkCode(codeHash, now)) continue;
      await this.repo.replaceLinkCode({ userId, channel, codeHash, expiresAt });
      return {
        code,
        expiresAt,
        command: `${LINK_COMMAND} ${code}`,
        sendTo: CLINIC_WHATSAPP,
      };
    }
    throw new ServiceUnavailableException(
      'No se pudo generar un código, intenta de nuevo',
    );
  }

  async redeem(
    channel: LinkableChannel,
    rawNumber: string,
    code: string,
    now: Date = new Date(),
  ): Promise<LinkRedeemResult> {
    const externalId = normalizeExternalNumber(rawNumber);
    if (!externalId) return { status: 'invalid_number' };

    const failures = await this.repo.countFailedAttemptsSince(
      channel,
      externalId,
      new Date(now.getTime() - HOUR_MS),
    );
    if (failures >= MAX_FAILED_ATTEMPTS_PER_HOUR) {
      this.logger.warn(
        `chat.link rate_limited channel=${channel} number=${maskNumber(externalId)}`,
      );
      return { status: 'rate_limited' };
    }

    const normalizedCode = code.trim();
    const userId = /^\d{6}$/.test(normalizedCode)
      ? await this.repo.consumeLinkCode(
          channel,
          hashLinkCode(normalizedCode),
          now,
        )
      : null;
    if (!userId) {
      await this.repo.recordAttempt(channel, externalId, false);
      return { status: 'invalid_code' };
    }

    const { previousUserId } = await this.repo.linkIdentity(
      userId,
      channel,
      externalId,
      now,
    );
    await this.repo.recordAttempt(channel, externalId, true);
    return { status: 'linked', userId, previousUserId };
  }

  async listLinks(userId: string): Promise<ChannelLinkView[]> {
    const identities = await this.repo.findActiveForUser(userId);
    return identities.map((identity) => ({
      id: identity.id,
      channel: identity.channel,
      number: maskNumber(identity.externalId),
      verifiedAt: identity.verifiedAt,
    }));
  }

  /** 404 si no existe, ya estaba revocado o es de otro usuario. */
  async unlink(
    userId: string,
    id: string,
    now: Date = new Date(),
  ): Promise<void> {
    if (!(await this.repo.revokeForUser(id, userId, now))) {
      throw new NotFoundException('Vínculo no encontrado');
    }
  }
}
