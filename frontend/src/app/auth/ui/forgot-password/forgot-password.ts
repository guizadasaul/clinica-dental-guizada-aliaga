import { Component, ChangeDetectionStrategy, signal, inject, DestroyRef } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../application/auth.service';
import { allValid, field, touchAll } from '../../../shared/validation/field';
import { isValidEmail, normalizeEmail } from '../../../shared/validation/email.validator';

const RESEND_COOLDOWN_SECONDS = 60;

@Component({
  selector: 'app-forgot-password',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, FormsModule],
  templateUrl: './forgot-password.html',
  styleUrl: './forgot-password.scss',
})
export class ForgotPasswordComponent {
  private readonly authService = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly email = field('', (v) =>
    isValidEmail(v) ? null : 'Ingresa un correo válido.',
  );
  protected readonly loading = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly submitted = signal(false);
  protected readonly cooldownSeconds = signal(0);

  private cooldownTimer?: ReturnType<typeof setInterval>;

  constructor() {
    this.destroyRef.onDestroy(() => {
      if (this.cooldownTimer !== undefined) {
        clearInterval(this.cooldownTimer);
      }
    });
  }

  protected async onSubmit(): Promise<void> {
    if (this.loading() || this.cooldownSeconds() > 0) {
      return;
    }

    touchAll(this.email);
    if (!allValid(this.email)) {
      return;
    }

    this.errorMessage.set(null);
    this.loading.set(true);

    try {
      await this.authService.requestPasswordReset(normalizeEmail(this.email.value()));
      this.submitted.set(true);
      this.startCooldown();
    } catch (err) {
      this.errorMessage.set(
        err instanceof HttpErrorResponse && err.status === 429
          ? 'Hiciste demasiados pedidos. Espera un momento y vuelve a intentarlo.'
          : 'No pudimos enviar el enlace. Revisa tu conexión e intenta de nuevo.',
      );
    } finally {
      this.loading.set(false);
    }
  }

  private startCooldown(): void {
    this.cooldownSeconds.set(RESEND_COOLDOWN_SECONDS);
    if (this.cooldownTimer !== undefined) {
      clearInterval(this.cooldownTimer);
    }
    this.cooldownTimer = setInterval(() => {
      this.cooldownSeconds.update((s) => Math.max(0, s - 1));
      if (this.cooldownSeconds() === 0 && this.cooldownTimer !== undefined) {
        clearInterval(this.cooldownTimer);
      }
    }, 1000);
  }
}
