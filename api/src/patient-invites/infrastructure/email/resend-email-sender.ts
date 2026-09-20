import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import type {
  EmailSender,
  InviteEmailKind,
  SendInviteEmailParams,
} from '../../domain/EmailSender.js';
import {
  INVITE_TTL_MINUTES,
  formatInviteTtl,
} from '../../domain/PatientInvite.js';
import { CLINIC_LOGO_PNG_BASE64 } from './clinic-logo.js';

interface ResendErrorBody {
  message?: string;
}

// Gmail (y otros clientes) borran los `<img src="data:...">` embebidos en el
// HTML por seguridad — el logo hay que mandarlo como adjunto inline referenciado
// por content_id y usar `cid:` en el <img>, no un data URI directo.
const CLINIC_LOGO_CONTENT_ID = 'clinic-logo';

interface InviteEmailCopy {
  subject: string;
  eyebrow: string;
  heading: string;
  intro: string;
}

// Copy específico por tipo de invitado. El resto del template (layout, logo,
// botón, footer) se mantiene idéntico — solo cambia este contenido.
const INVITE_EMAIL_COPY: Record<InviteEmailKind, InviteEmailCopy> = {
  patient: {
    subject: 'Completá tu registro en Clínica Dental Guizada-Aliaga',
    eyebrow: 'Invitación de registro',
    heading: 'Completá tu registro',
    intro:
      'te invita a completar tu registro para que puedas ' +
      'ver tus citas, tu historial clínico y tus presupuestos desde un solo lugar. Es rápido y te toma ' +
      'menos de un minuto.',
  },
  doctor: {
    subject: 'Invitación para unirte al staff de Clínica Dental Guizada-Aliaga',
    eyebrow: 'Invitación al equipo',
    heading: 'Unite al equipo',
    intro:
      'te invita a sumarte a su staff de odontólogos. Completá tu cuenta para acceder a tu ' +
      'panel, tu agenda y las fichas de tus pacientes.',
  },
};

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
    const replyTo = process.env['RESEND_REPLY_TO'];

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
          subject: INVITE_EMAIL_COPY[params.kind].subject,
          html: this.buildHtml(params),
          text: this.buildText(params),
          attachments: [
            {
              filename: 'logo-clinica.png',
              content: CLINIC_LOGO_PNG_BASE64,
              content_type: 'image/png',
              content_id: CLINIC_LOGO_CONTENT_ID,
            },
          ],
          ...(replyTo ? { reply_to: replyTo } : {}),
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
    const name = this.escapeHtml(params.displayName);
    const url = this.escapeHtml(params.inviteUrl);
    const copy = INVITE_EMAIL_COPY[params.kind];
    const expiresIn = formatInviteTtl(INVITE_TTL_MINUTES[params.kind]);

    return `
<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${copy.heading}</title>
  </head>
  <body style="margin:0; padding:0; background-color:#f3ede1; font-family:'Source Sans 3', Arial, Helvetica, sans-serif;">
    <span style="display:none; visibility:hidden; opacity:0; overflow:hidden; height:0; width:0; max-height:0; max-width:0; mso-hide:all;">
      ${name}, completá tu registro en Clínica Dental Guizada-Aliaga en solo un minuto.
    </span>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f3ede1;">
      <tr>
        <td align="center" style="padding:40px 16px;">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px; width:100%; background-color:#fff9ed; border-radius:16px; overflow:hidden; border:1px solid #e8e2d6;">

            <!-- Barra superior de marca -->
            <tr>
              <td style="height:6px; line-height:6px; font-size:0; background-color:#e89858; background-image:linear-gradient(90deg, #e89858 0%, #ff8902 100%);">&nbsp;</td>
            </tr>

            <!-- Header con logo -->
            <tr>
              <td align="center" style="padding:36px 40px 8px;">
                <img
                  src="cid:${CLINIC_LOGO_CONTENT_ID}"
                  width="200"
                  alt="Clínica Dental Guizada-Aliaga"
                  style="display:block; width:200px; max-width:60%; height:auto; border:0;"
                />
              </td>
            </tr>

            <!-- Contenido -->
            <tr>
              <td style="padding:24px 40px 8px;">
                <p style="margin:0 0 12px; font-family:Georgia, 'Libre Caslon Text', serif; font-size:11px; font-weight:700; letter-spacing:0.12em; text-transform:uppercase; color:#e89858; text-align:center;">
                  ${copy.eyebrow}
                </p>
                <h1 style="margin:0 0 20px; font-family:Georgia, 'Libre Caslon Text', serif; font-size:26px; line-height:1.3; font-weight:400; color:#1c1b1f; text-align:center;">
                  ${copy.heading}
                </h1>
                <p style="margin:0 0 16px; font-size:16px; line-height:1.6; color:#1c1b1f;">
                  Hola ${name},
                </p>
                <p style="margin:0 0 24px; font-size:16px; line-height:1.6; color:#1c1b1f;">
                  El equipo de <strong>Clínica Dental Guizada-Aliaga</strong> ${copy.intro}
                </p>
              </td>
            </tr>

            <!-- Botón -->
            <tr>
              <td align="center" style="padding:0 40px 8px;">
                <table role="presentation" cellpadding="0" cellspacing="0">
                  <tr>
                    <td align="center" style="border-radius:10px; background-color:#e89858; background-image:linear-gradient(135deg, #e89858 0%, #ff8902 100%);">
                      <a
                        href="${url}"
                        target="_blank"
                        rel="noopener noreferrer"
                        style="display:inline-block; padding:14px 36px; font-family:'Source Sans 3', Arial, Helvetica, sans-serif; font-size:16px; font-weight:700; color:#ffffff; text-decoration:none; border-radius:10px;"
                      >
                        Completar mi registro
                      </a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <!-- Fallback link + expiración -->
            <tr>
              <td style="padding:24px 40px 0;">
                <p style="margin:0 0 6px; font-size:13px; line-height:1.5; color:#4d4640;">
                  Si el botón no funciona, copiá y pegá este enlace en tu navegador:
                </p>
                <p style="margin:0 0 24px; font-size:13px; line-height:1.5; word-break:break-all;">
                  <a href="${url}" style="color:#e89858;">${url}</a>
                </p>
                <p style="margin:0 0 32px; font-size:13px; line-height:1.5; color:#4d4640;">
                  Por tu seguridad, este enlace vence en <strong>${expiresIn}</strong>.
                </p>
              </td>
            </tr>

            <!-- Separador -->
            <tr>
              <td style="padding:0 40px;">
                <div style="border-top:1px solid #e8e2d6;"></div>
              </td>
            </tr>

            <!-- Footer -->
            <tr>
              <td style="padding:28px 40px 36px;">
                <p style="margin:0 0 4px; font-family:Georgia, 'Libre Caslon Text', serif; font-size:15px; font-weight:700; color:#1c1b1f;">
                  Clínica Dental Guizada-Aliaga
                </p>
                <p style="margin:0 0 16px; font-size:13px; line-height:1.5; color:#4d4640;">
                  Edificio Guizada, 1er piso — Carmela Serruto entre Suárez Miranda y Waldo Ballivián<br />
                  Quillacollo, Cochabamba
                </p>
                <p style="margin:0 0 16px; font-size:13px; line-height:1.6; color:#4d4640;">
                  <a href="https://wa.me/59157744250" style="color:#4d4640; text-decoration:underline;">+591 577 44250</a>
                  &nbsp;·&nbsp;
                  <a href="mailto:clinicadentalguizadaaliaga@gmail.com" style="color:#4d4640; text-decoration:underline;">clinicadentalguizadaaliaga@gmail.com</a>
                </p>
                <p style="margin:0; font-size:12px; line-height:1.5; color:#9b9488;">
                  Recibiste este correo porque un profesional de Clínica Dental Guizada-Aliaga registró tu contacto para
                  invitarte a crear tu cuenta. Si creés que fue un error, podés ignorar este mensaje.
                </p>
              </td>
            </tr>
          </table>

          <p style="margin:20px 0 0; font-size:12px; color:#9b9488; text-align:center;">
            © ${new Date().getFullYear()} Clínica Dental Guizada-Aliaga. Todos los derechos reservados.
          </p>
        </td>
      </tr>
    </table>
  </body>
</html>
    `.trim();
  }

  private buildText(params: SendInviteEmailParams): string {
    const copy = INVITE_EMAIL_COPY[params.kind];
    const expiresIn = formatInviteTtl(INVITE_TTL_MINUTES[params.kind]);
    return `
Hola ${params.displayName},

El equipo de Clínica Dental Guizada-Aliaga ${copy.intro}

Completá tu registro acá: ${params.inviteUrl}

Por tu seguridad, este enlace vence en ${expiresIn}.

—
Clínica Dental Guizada-Aliaga
Edificio Guizada, 1er piso — Carmela Serruto entre Suárez Miranda y Waldo Ballivián, Quillacollo, Cochabamba
+591 577 44250 · clinicadentalguizadaaliaga@gmail.com
    `.trim();
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}
