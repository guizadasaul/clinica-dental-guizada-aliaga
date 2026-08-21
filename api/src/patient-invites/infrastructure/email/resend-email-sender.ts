import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import type {
  EmailSender,
  SendInviteEmailParams,
} from '../../domain/EmailSender.js';

interface ResendErrorBody {
  message?: string;
}

/**
 * Mismo patrón que BanecoClient (api/src/payments/infrastructure/baneco/baneco.client.ts):
 * las env vars se leen de forma perezosa (recién al mandar un email, no en el
 * constructor) para que la app arranque igual sin RESEND_API_KEY configurada
 * — solo falla el envío de invitaciones por email, no todo el proceso.
 * fetch directo a la API de Resend, sin agregar su SDK como dependencia nueva.
 */
@Injectable()
export class ResendEmailSender implements EmailSender {
  async sendInviteEmail(params: SendInviteEmailParams): Promise<void> {
    const apiKey = process.env['RESEND_API_KEY'];
    const fromEmail = process.env['RESEND_FROM_EMAIL'];
    if (!apiKey || !fromEmail) {
      throw new ServiceUnavailableException(
        'El envío de emails no está configurado (RESEND_API_KEY / RESEND_FROM_EMAIL)',
      );
    }

    let response: Response;
    try {
      response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          from: fromEmail,
          to: params.to,
          subject: 'Completá tu registro en Clínica Guizada-Aliaga',
          html: this.buildHtml(params),
        }),
      });
    } catch (error) {
      throw new ServiceUnavailableException(
        `No se pudo conectar con Resend: ${(error as Error).message}`,
      );
    }

    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as ResendErrorBody;
      throw new ServiceUnavailableException(
        body.message || `Error de Resend (HTTP ${response.status})`,
      );
    }
  }

  private buildHtml(params: SendInviteEmailParams): string {
    return `
      <p>Hola ${params.patientDisplayName},</p>
      <p>Completá tu registro en Clínica Guizada-Aliaga haciendo clic en el siguiente enlace:</p>
      <p><a href="${params.inviteUrl}">${params.inviteUrl}</a></p>
      <p>Este enlace vence en 30 días.</p>
    `.trim();
  }
}
