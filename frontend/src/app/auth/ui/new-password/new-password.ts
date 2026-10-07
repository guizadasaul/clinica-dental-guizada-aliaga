import { Component, ChangeDetectionStrategy, signal, inject, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { RouterLink, Router, ActivatedRoute } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { PasswordResetLinkService } from '../../application/password-reset-link.service';
import { allValid, field, touchAll } from '../../../shared/validation/field';
import { passwordsMatch, validatePassword } from '../../../shared/validation/password.validator';

type LinkState = 'checking' | 'invalid' | 'ready';

const EXPIRED_MESSAGE = 'Este enlace venció o ya se usó. Pídele a la clínica uno nuevo.';

function saveError(err: unknown): string {
  if (!(err instanceof HttpErrorResponse)) {
    return 'No se pudo guardar la contraseña.';
  }
  switch (err.status) {
    case 400:
      // Supabase rechazó la contraseña: el backend dice por qué.
      return typeof err.error?.message === 'string'
        ? err.error.message
        : 'Revisa que la contraseña tenga entre 8 y 72 caracteres.';
    case 429:
      return 'Hiciste demasiados intentos. Espera un momento y vuelve a intentarlo.';
    default:
      return 'No pudimos guardar la contraseña en este momento. Intenta de nuevo en unos minutos.';
  }
}

/**
 * Contraseña nueva con el link que manda la clínica por WhatsApp (CLI-244),
 * para quien se registró con teléfono y no tiene correo para recuperarla.
 * No inicia sesión: al guardar, manda al login con la contraseña nueva.
 */
@Component({
  selector: 'app-new-password',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, FormsModule],
  templateUrl: './new-password.html',
  styleUrl: './new-password.scss',
})
export class NewPasswordComponent implements OnInit {
  private readonly resetLinks = inject(PasswordResetLinkService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  private token = '';

  protected readonly state = signal<LinkState>('checking');
  protected readonly invalidMessage = signal(EXPIRED_MESSAGE);
  protected readonly phoneHint = signal<string | null>(null);
  protected readonly password = field('', validatePassword);
  protected readonly confirmPassword = field('', (v) => passwordsMatch(this.password.value(), v));
  protected readonly passwordVisible = signal(false);
  protected readonly loading = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  ngOnInit(): void {
    void this.checkLink();
  }

  private async checkLink(): Promise<void> {
    this.token = this.route.snapshot.paramMap.get('token') ?? '';
    if (!this.token) {
      this.state.set('invalid');
      return;
    }
    try {
      const status = await firstValueFrom(this.resetLinks.checkStatus(this.token));
      this.phoneHint.set(status.phoneHint ?? null);
      this.state.set(status.valid ? 'ready' : 'invalid');
    } catch {
      this.invalidMessage.set('No pudimos verificar el enlace. Intenta de nuevo más tarde.');
      this.state.set('invalid');
    }
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
      await firstValueFrom(this.resetLinks.resetPassword(this.token, this.password.value()));
      await this.router.navigate(['/auth/login'], { queryParams: { reset: 'success' } });
    } catch (err) {
      if (err instanceof HttpErrorResponse && err.status === 403) {
        this.state.set('invalid');
      } else {
        this.errorMessage.set(saveError(err));
      }
      this.loading.set(false);
    }
  }
}
