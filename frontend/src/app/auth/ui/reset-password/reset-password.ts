import { Component, ChangeDetectionStrategy, signal, inject, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink, Router } from '@angular/router';
import { AuthService } from '../../application/auth.service';
import { allValid, field, touchAll } from '../../../shared/validation/field';
import { passwordsMatch, validatePassword } from '../../../shared/validation/password.validator';

@Component({
  selector: 'app-reset-password',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, FormsModule],
  templateUrl: './reset-password.html',
  styleUrl: './reset-password.scss',
})
export class ResetPasswordComponent implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly checkingSession = signal(true);
  protected readonly sessionValid = signal(false);
  protected readonly password = field('', validatePassword);
  protected readonly confirmPassword = field('', (v) => passwordsMatch(this.password.value(), v));
  protected readonly passwordVisible = signal(false);
  protected readonly loading = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  async ngOnInit(): Promise<void> {
    // Resuelto por el branch PASSWORD_RECOVERY en AuthService una vez que
    // Supabase procesó el token del enlace de recuperación en la URL.
    await this.authService.authReady;
    this.sessionValid.set(await this.authService.hasRecoverySession());
    this.checkingSession.set(false);
  }

  protected togglePasswordVisibility(): void {
    this.passwordVisible.update((v) => !v);
  }

  protected async onSubmit(): Promise<void> {
    if (this.loading()) {
      return;
    }

    touchAll(this.password, this.confirmPassword);
    if (!allValid(this.password, this.confirmPassword)) {
      return;
    }

    this.errorMessage.set(null);
    this.loading.set(true);

    try {
      await this.authService.updatePassword(this.password.value());
      await this.authService.logout();
      await this.router.navigate(['/auth/login'], { queryParams: { reset: 'success' } });
    } catch (err) {
      this.errorMessage.set(err instanceof Error ? err.message : 'No se pudo actualizar la contraseña.');
      this.loading.set(false);
    }
  }
}
