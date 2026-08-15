import { Component, ChangeDetectionStrategy, signal, inject, OnInit } from '@angular/core';
import { RouterLink, Router, ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../../../auth/application/auth.service';
import { PatientInvitesService } from '../../../patient-invites/services/patient-invites.service';
import { looksLikePhone, normalizePhone } from '../../../../auth/application/phone.util';

@Component({
  selector: 'app-invitation-landing',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, FormsModule],
  templateUrl: './invitation-landing.html',
  styleUrl: './invitation-landing.scss',
})
export class InvitationLandingComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly patientInvitesService = inject(PatientInvitesService);
  private readonly authService = inject(AuthService);

  private token: string | null = null;

  protected readonly loading = signal(true);
  protected readonly valid = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly connecting = signal(false);

  protected readonly identifier = signal('');
  protected readonly password = signal('');
  protected readonly confirmPassword = signal('');
  protected readonly passwordVisible = signal(false);
  protected readonly formLoading = signal(false);
  protected readonly registered = signal(false);

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
      localStorage.setItem('pendingInviteToken', this.token);
      await this.authService.loginWithGoogle();
      // En éxito el browser navega a Google; el callback maneja el resto.
    } catch {
      localStorage.removeItem('pendingInviteToken');
      this.errorMessage.set('No se pudo conectar con Google. Intentá nuevamente.');
      this.connecting.set(false);
    }
  }

  protected togglePasswordVisibility(): void {
    this.passwordVisible.update((v) => !v);
  }

  protected async onSubmit(): Promise<void> {
    if (!this.token || this.formLoading()) {
      return;
    }

    const identifier = this.identifier().trim();
    const password = this.password();

    if (!identifier || !password) {
      this.errorMessage.set('Correo/teléfono y contraseña son obligatorios.');
      return;
    }
    if (password.length < 6) {
      this.errorMessage.set('La contraseña debe tener al menos 6 caracteres.');
      return;
    }
    if (password !== this.confirmPassword()) {
      this.errorMessage.set('Las contraseñas no coinciden.');
      return;
    }

    this.errorMessage.set(null);
    this.formLoading.set(true);
    // Igual que onContinueWithGoogle: el token queda guardado ANTES de crear
    // la cuenta, para que syncWithBackend lo encuentre apenas se establezca
    // la sesión (login por teléfono) o cuando se confirme por correo.
    localStorage.setItem('pendingInviteToken', this.token);

    try {
      if (looksLikePhone(identifier)) {
        await this.authService.registerWithPhone(normalizePhone(identifier), password);
        // waitForSync, no authReady: authReady ya está resuelta desde que
        // arrancó la app (esta pantalla no es una carga fresca) — no sirve
        // para esperar el sync nuevo que recién disparó este registro, y sin
        // esperarlo el guard de ficha puede leer currentUser().role todavía
        // en null y mandar a la landing aunque el link haya sido válido.
        await this.authService.waitForSync();
        await this.router.navigateByUrl('/dashboard');
      } else {
        await this.authService.registerWithPassword(identifier, password);
        this.registered.set(true);
      }
    } catch (err) {
      localStorage.removeItem('pendingInviteToken');
      if (err instanceof HttpErrorResponse && err.status === 409) {
        this.errorMessage.set('Ese teléfono ya está registrado.');
      } else {
        this.errorMessage.set(err instanceof Error ? err.message : 'No se pudo crear la cuenta.');
      }
    } finally {
      this.formLoading.set(false);
    }
  }
}
