import { Component, ChangeDetectionStrategy, inject, input, output, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { PatientInvitesService } from '../../../patient-invites/services/patient-invites.service';

@Component({
  selector: 'app-send-invite',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './send-invite.html',
  styleUrl: './send-invite.scss',
})
export class SendInviteComponent {
  private readonly patientInvitesService = inject(PatientInvitesService);

  readonly patientId = input.required<string>();
  readonly initialEmail = input<string | null>(null);
  readonly initialPhone = input<string | null>(null);
  readonly sent = output<void>();
  readonly cancel = output<void>();

  protected readonly loadingChannel = signal<'email' | 'whatsapp' | null>(null);
  protected readonly error = signal<string | null>(null);

  protected async onSendEmail(): Promise<void> {
    this.loadingChannel.set('email');
    this.error.set(null);
    try {
      await firstValueFrom(this.patientInvitesService.createInvite(this.patientId(), 'email'));
      this.sent.emit();
    } catch {
      this.error.set('No pudimos enviar el email. Intentá de nuevo.');
    } finally {
      this.loadingChannel.set(null);
    }
  }

  protected async onSendWhatsapp(): Promise<void> {
    this.loadingChannel.set('whatsapp');
    this.error.set(null);
    try {
      const result = await firstValueFrom(
        this.patientInvitesService.createInvite(this.patientId(), 'whatsapp'),
      );
      if (result.whatsappUrl) {
        window.open(result.whatsappUrl, '_blank');
      }
      this.sent.emit();
    } catch {
      this.error.set('No pudimos armar el mensaje de WhatsApp. Intentá de nuevo.');
    } finally {
      this.loadingChannel.set(null);
    }
  }

  protected onCancel(): void {
    this.cancel.emit();
  }
}
