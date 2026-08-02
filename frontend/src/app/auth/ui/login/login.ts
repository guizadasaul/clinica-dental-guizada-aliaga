import { Component, ChangeDetectionStrategy, signal, inject } from '@angular/core';
import { RouterLink, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../application/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, FormsModule],
  templateUrl: './login.html',
  styleUrl: './login.scss',
})
export class LoginComponent {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly loading = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  protected phone = '';
  protected password = '';

  protected async onGoogleLogin(): Promise<void> {
    if (this.loading()) {
      return;
    }

    this.loading.set(true);
    this.errorMessage.set(null);

    try {
      await this.authService.loginWithGoogle();
      await this.router.navigate(['/dashboard']);
    } catch (error: unknown) {
      if (typeof error === 'object' && error !== null && 'code' in error) {
        const code = (error as { code: string }).code;
        if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
          this.loading.set(false);
          return;
        }
      }
      this.errorMessage.set('No se pudo iniciar sesión con Google. Intentá nuevamente.');
    } finally {
      this.loading.set(false);
    }
  }

  protected async onPhoneLogin(): Promise<void> {
    if (this.loading()) {
      return;
    }

    this.loading.set(true);
    this.errorMessage.set(null);

    try {
      await this.authService.loginWithPhone(this.phone, this.password);
      await this.router.navigate(['/dashboard']);
    } catch (error: unknown) {
      const status = (error as { status?: number })?.status;
      if (status === 401) {
        this.errorMessage.set('Teléfono o contraseña incorrectos.');
      } else {
        this.errorMessage.set('No se pudo iniciar sesión. Intentá nuevamente.');
      }
    } finally {
      this.loading.set(false);
    }
  }
}
