import { Component, ChangeDetectionStrategy, signal, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../application/auth.service';

@Component({
  selector: 'app-register',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, FormsModule],
  templateUrl: './register.html',
  styleUrl: './register.scss',
})
export class RegisterComponent {
  private readonly authService = inject(AuthService);

  protected readonly email = signal('');
  protected readonly password = signal('');
  protected readonly confirmPassword = signal('');
  protected readonly passwordVisible = signal(false);
  protected readonly loading = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly registered = signal(false);

  protected togglePasswordVisibility(): void {
    this.passwordVisible.update((v) => !v);
  }

  protected async onSubmit(): Promise<void> {
    if (this.loading()) {
      return;
    }

    const email = this.email().trim();
    const password = this.password();

    if (!email || !password) {
      this.errorMessage.set('Correo y contraseña son obligatorios.');
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
    this.loading.set(true);

    try {
      await this.authService.registerWithPassword(email, password);
      this.registered.set(true);
    } catch (err) {
      this.errorMessage.set(err instanceof Error ? err.message : 'No se pudo crear la cuenta.');
    } finally {
      this.loading.set(false);
    }
  }

  protected async onGoogleLogin(): Promise<void> {
    if (this.loading()) {
      return;
    }

    this.loading.set(true);
    this.errorMessage.set(null);

    try {
      await this.authService.loginWithGoogle();
      // En éxito el browser navega a Google; el callback maneja el resto.
    } catch {
      this.errorMessage.set('No se pudo continuar con Google. Intentá nuevamente.');
      this.loading.set(false);
    }
  }
}
