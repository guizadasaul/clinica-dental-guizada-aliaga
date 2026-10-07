import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { SupabaseAdminService } from '../../auth/infrastructure/SupabaseAdminService.js';
import { buildWhatsappUrl, phoneLastDigits } from '../../shared/phone.util.js';
import { PasswordResetLinkRepository } from '../domain/PasswordResetLinkRepository.js';
import type { IPasswordResetLinkRepository } from '../domain/PasswordResetLinkRepository.js';

/** Vigencia del link de contraseña nueva (CLI-244). */
export const RESET_LINK_TTL_MINUTES = 30;

export interface CreateResetLinkResult {
  whatsappUrl: string;
}

/** Respuesta pública de /password-reset/:token/status. */
export interface ResetLinkStatusResult {
  valid: boolean;
  /** Últimos 3 dígitos del teléfono de la cuenta, solo con el link vigente. */
  phoneHint?: string;
}

function hashToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex');
}

// Sin emojis: wa.me los corrompe (ver buildWhatsappUrl).
function buildWhatsappMessage(fullName: string, resetUrl: string): string {
  return [
    `¡Hola *${fullName}*!`,
    '',
    'Te escribimos de *Clínica Dental Guizada-Aliaga*. Con este enlace puedes crear una nueva contraseña para tu cuenta:',
    resetUrl,
    '',
    `_Por tu seguridad, el enlace vence en ${RESET_LINK_TTL_MINUTES} minutos y sirve una sola vez. Si no lo pediste, ignora este mensaje._`,
  ].join('\n');
}

/**
 * Contraseña nueva para cuentas sin correo (CLI-244): una cuenta creada solo
 * con teléfono no puede usar "Olvidé mi contraseña", así que el doctor le
 * manda desde la ficha un link de un solo uso por WhatsApp. El link solo
 * cambia la contraseña de la cuenta de esa ficha.
 */
@Injectable()
export class PasswordResetService {
  constructor(
    @Inject(PasswordResetLinkRepository)
    private readonly links: IPasswordResetLinkRepository,
    private readonly supabaseAdmin: SupabaseAdminService,
  ) {}

  async createLink(patientId: string): Promise<CreateResetLinkResult> {
    const account = await this.links.findPatientAccount(patientId);
    if (!account) {
      throw new NotFoundException('Paciente no encontrado');
    }
    if (!account.authUserId) {
      throw new ConflictException(
        'El paciente todavía no tiene una cuenta. Mándale el registro.',
      );
    }
    if (!account.phone) {
      throw new ConflictException(
        'El paciente no tiene un teléfono cargado todavía',
      );
    }

    const rawToken = randomBytes(32).toString('base64url');
    const now = new Date();
    const expiresAt = new Date(
      now.getTime() + RESET_LINK_TTL_MINUTES * 60 * 1000,
    );
    await this.links.replaceForUser(
      account.userId,
      hashToken(rawToken),
      expiresAt,
      now,
    );

    const frontendUrl = (
      process.env['FRONTEND_URL'] ?? 'http://localhost:4200'
    ).replace(/\/$/, '');
    const resetUrl = `${frontendUrl}/recuperar/${rawToken}`;
    return {
      whatsappUrl: buildWhatsappUrl(
        account.phone,
        buildWhatsappMessage(account.fullName, resetUrl),
      ),
    };
  }

  async checkStatus(rawToken: string): Promise<ResetLinkStatusResult> {
    const status = await this.links.findStatus(hashToken(rawToken), new Date());
    if (!status?.valid) {
      return { valid: false };
    }
    return status.phone
      ? { valid: true, phoneHint: phoneLastDigits(status.phone) }
      : { valid: true };
  }

  async resetPassword(rawToken: string, password: string): Promise<void> {
    const tokenHash = hashToken(rawToken);
    const link = await this.links.redeem(tokenHash, new Date());
    if (!link) {
      throw new ForbiddenException(
        'Este enlace venció o ya se usó. Pídele a la clínica uno nuevo.',
      );
    }
    try {
      await this.supabaseAdmin.setPassword(link.authUserId, password);
    } catch (err) {
      // Contraseña rechazada o Supabase caído: el link vuelve a servir para
      // que el paciente reintente sin pedir otro.
      await this.links.release(tokenHash);
      throw err;
    }
  }
}
