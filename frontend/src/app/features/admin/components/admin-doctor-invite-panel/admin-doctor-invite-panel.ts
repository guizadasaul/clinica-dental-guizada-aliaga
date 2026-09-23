import { Component, ChangeDetectionStrategy, inject, input, output, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { AdminDoctorsService } from '../../services/admin-doctors.service';
import type { InviteChannel } from '../../../patient-invites/services/patient-invites.service';
import type { AdminDoctorSummary } from '../../models/admin-doctor.model';
import { PageHeaderComponent } from '../../../../shared/ui/page-header/page-header';

const CHANNEL_ERROR: Record<InviteChannel, string> = {
  email: 'No pudimos enviar el email. Intentá de nuevo.',
  whatsapp: 'No pudimos armar el mensaje de WhatsApp. Intentá de nuevo.',
};

/**
 * Paso 2 del alta de un doctor (CLI-78): el doctor ya está creado como
 * pendiente y acá el admin elige por dónde mandarle el link de invitación.
 * Espejo de PatientInvitePanelComponent, pero sin editar el contacto acá: el
 * email/teléfono se corrigen desde "Editar" (`editRequested`), así hay una
 * sola fuente de verdad para esos datos.
 */
@Component({
  selector: 'app-admin-doctor-invite-panel',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PageHeaderComponent],
  templateUrl: './admin-doctor-invite-panel.html',
  styleUrl: './admin-doctor-invite-panel.scss',
})
export class AdminDoctorInvitePanelComponent {
  private readonly adminDoctorsService = inject(AdminDoctorsService);

  readonly doctor = input.required<AdminDoctorSummary>();
  readonly sent = output<InviteChannel>();
  readonly editRequested = output<void>();
  readonly closed = output<void>();

  protected readonly loadingChannel = signal<InviteChannel | null>(null);
  protected readonly sendError = signal<string | null>(null);

  protected async send(channel: InviteChannel): Promise<void> {
    if (this.loadingChannel() !== null) {
      return;
    }
    this.loadingChannel.set(channel);
    this.sendError.set(null);
    try {
      const result = await firstValueFrom(this.adminDoctorsService.createInvite(this.doctor().id, channel));
      if (channel === 'whatsapp' && result.whatsappUrl) {
        // noopener/noreferrer: la pestaña de WhatsApp no necesita acceso a esta ventana.
        window.open(result.whatsappUrl, '_blank', 'noopener,noreferrer');
      }
      this.sent.emit(channel);
    } catch (error) {
      this.sendError.set(this.messageFor(error, channel));
    } finally {
      this.loadingChannel.set(null);
    }
  }

  protected onEditContact(): void {
    this.editRequested.emit();
  }

  protected onClose(): void {
    this.closed.emit();
  }

  /** 409 = regla de negocio del backend (ya se registró, dado de baja, falta el contacto del canal): su mensaje ya está en español. */
  private messageFor(error: unknown, channel: InviteChannel): string {
    if (error instanceof HttpErrorResponse && error.status === 409) {
      const message = (error.error as { message?: unknown } | null)?.message;
      if (typeof message === 'string' && message) {
        return message;
      }
    }
    return CHANNEL_ERROR[channel];
  }
}
