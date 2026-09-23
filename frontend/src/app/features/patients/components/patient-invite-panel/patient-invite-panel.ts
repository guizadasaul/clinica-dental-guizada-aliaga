import { Component, ChangeDetectionStrategy, computed, effect, inject, input, output, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { PatientsService } from '../../services/patients.service';
import {
  PatientInvitesService,
  type InviteChannel,
} from '../../../patient-invites/services/patient-invites.service';
import { PageHeaderComponent } from '../../../../shared/ui/page-header/page-header';

@Component({
  selector: 'app-patient-invite-panel',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PageHeaderComponent],
  templateUrl: './patient-invite-panel.html',
  styleUrl: './patient-invite-panel.scss',
})
export class PatientInvitePanelComponent {
  private readonly patientsService = inject(PatientsService);
  private readonly patientInvitesService = inject(PatientInvitesService);

  readonly patientId = input.required<string>();
  readonly initialFirstName = input('');
  readonly initialLastNamePaternal = input('');
  readonly initialPhone = input<string | null>(null);
  readonly initialEmail = input<string | null>(null);
  readonly sent = output<InviteChannel>();
  readonly cancel = output<void>();

  protected readonly firstName = signal('');
  protected readonly lastNamePaternal = signal('');
  protected readonly phone = signal('');
  protected readonly email = signal('');

  // Últimos valores guardados en el backend — contra esto se compara para
  // saber si hay cambios sin guardar (isDirty) y para habilitar el envío.
  protected readonly savedPhone = signal<string | null>(null);
  protected readonly savedEmail = signal<string | null>(null);

  protected readonly saving = signal(false);
  protected readonly saveError = signal<string | null>(null);
  protected readonly loadingChannel = signal<'email' | 'whatsapp' | null>(null);
  protected readonly sendError = signal<string | null>(null);

  protected readonly isDirty = computed(
    () =>
      (this.phone().trim() || null) !== this.savedPhone() ||
      (this.email().trim() || null) !== this.savedEmail(),
  );

  constructor() {
    effect(
      () => {
        this.firstName.set(this.initialFirstName());
        this.lastNamePaternal.set(this.initialLastNamePaternal());
        this.phone.set(this.initialPhone() ?? '');
        this.email.set(this.initialEmail() ?? '');
        this.savedPhone.set(this.initialPhone());
        this.savedEmail.set(this.initialEmail());
      },
      { allowSignalWrites: true },
    );
  }

  protected async onSave(): Promise<void> {
    if (!this.firstName().trim() || !this.lastNamePaternal().trim()) {
      this.saveError.set('Nombre y apellido paterno son obligatorios.');
      return;
    }
    this.saving.set(true);
    this.saveError.set(null);
    try {
      const trimmedPhone = this.phone().trim() || undefined;
      const trimmedEmail = this.email().trim() || undefined;
      await firstValueFrom(
        this.patientsService.updatePatient(this.patientId(), {
          firstName: this.firstName().trim(),
          lastNamePaternal: this.lastNamePaternal().trim(),
          phone: trimmedPhone,
          email: trimmedEmail,
        }),
      );
      this.savedPhone.set(trimmedPhone ?? null);
      this.savedEmail.set(trimmedEmail ?? null);
    } catch {
      this.saveError.set('No pudimos guardar los cambios. Intentá de nuevo.');
    } finally {
      this.saving.set(false);
    }
  }

  protected async onSendEmail(): Promise<void> {
    this.loadingChannel.set('email');
    this.sendError.set(null);
    try {
      await firstValueFrom(this.patientInvitesService.createInvite(this.patientId(), 'email'));
      this.sent.emit('email');
    } catch {
      this.sendError.set('No pudimos enviar el email. Intentá de nuevo.');
    } finally {
      this.loadingChannel.set(null);
    }
  }

  protected async onSendWhatsapp(): Promise<void> {
    this.loadingChannel.set('whatsapp');
    this.sendError.set(null);
    try {
      const result = await firstValueFrom(
        this.patientInvitesService.createInvite(this.patientId(), 'whatsapp'),
      );
      if (result.whatsappUrl) {
        window.open(result.whatsappUrl, '_blank');
      }
      this.sent.emit('whatsapp');
    } catch {
      this.sendError.set('No pudimos armar el mensaje de WhatsApp. Intentá de nuevo.');
    } finally {
      this.loadingChannel.set(null);
    }
  }

  protected onCancel(): void {
    this.cancel.emit();
  }
}
