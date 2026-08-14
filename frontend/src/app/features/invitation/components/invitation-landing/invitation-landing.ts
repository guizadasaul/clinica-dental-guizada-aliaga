import { Component, ChangeDetectionStrategy, signal, inject, OnInit } from '@angular/core';
import { RouterLink, ActivatedRoute } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../../../auth/application/auth.service';
import { PatientInvitesService } from '../../../patient-invites/services/patient-invites.service';

@Component({
  selector: 'app-invitation-landing',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  templateUrl: './invitation-landing.html',
  styleUrl: './invitation-landing.scss',
})
export class InvitationLandingComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly patientInvitesService = inject(PatientInvitesService);
  private readonly authService = inject(AuthService);

  private token: string | null = null;

  protected readonly loading = signal(true);
  protected readonly valid = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly connecting = signal(false);

  async ngOnInit(): Promise<void> {
    this.token = this.route.snapshot.paramMap.get('token');
    if (!this.token) {
      this.errorMessage.set('Este link de invitación no es válido.');
      this.loading.set(false);
      return;
    }

    try {
      const result = await firstValueFrom(this.patientInvitesService.checkStatus(this.token));
      this.valid.set(result.valid);
      if (!result.valid) {
        this.errorMessage.set(
          'Este link venció o ya fue usado. Pedile al doctor que te lo reenvíe.',
        );
      }
    } catch {
      this.errorMessage.set('No pudimos verificar el link. Intentá de nuevo más tarde.');
    } finally {
      this.loading.set(false);
    }
  }

  protected async onContinueWithGoogle(): Promise<void> {
    if (!this.token || this.connecting()) {
      return;
    }
    this.connecting.set(true);
    try {
      sessionStorage.setItem('pendingInviteToken', this.token);
      await this.authService.loginWithGoogle();
      // En éxito el browser navega a Google; el callback maneja el resto.
    } catch {
      sessionStorage.removeItem('pendingInviteToken');
      this.errorMessage.set('No se pudo conectar con Google. Intentá nuevamente.');
      this.connecting.set(false);
    }
  }
}
