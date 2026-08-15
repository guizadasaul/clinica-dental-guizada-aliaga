import { Component, ChangeDetectionStrategy, signal, inject, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink, Router, ActivatedRoute } from '@angular/router';
import { AuthService } from '../../application/auth.service';
import { looksLikePhone, normalizePhone } from '../../application/phone.util';

@Component({
  selector: 'app-login',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, FormsModule],
  templateUrl: './login.html',
  styleUrl: './login.scss',
})
export class LoginComponent implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly identifier = signal('');
  protected readonly password = signal('');
  protected readonly passwordVisible = signal(false);
  protected readonly loading = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly successMessage = signal<string | null>(null);

  ngOnInit(): void {
    if (this.route.snapshot.queryParamMap.get('reset') === 'success') {
      this.successMessage.set('Tu contraseña fue actualizada. Iniciá sesión con tu nueva contraseña.');
    }
  }

  protected togglePasswordVisibility(): void {
    this.passwordVisible.update((v) => !v);
  }

  protected async onSubmit(): Promise<void> {
    if (this.loading()) {
      return;
    }

    const identifier = this.identifier().trim();
    const password = this.password();
    if (!identifier || !password) {
      this.errorMessage.set('Correo/teléfono y contraseña son obligatorios.');
      return;
    }

    this.errorMessage.set(null);
    this.successMessage.set(null);
    this.loading.set(true);

    try {
      if (looksLikePhone(identifier)) {
        await this.authService.loginWithPhone(normalizePhone(identifier), password);
      } else {
        await this.authService.loginWithPassword(identifier, password);
      }
      await this.router.navigateByUrl('/dashboard');
    } catch (err) {
      this.errorMessage.set(err instanceof Error ? err.message : 'No se pudo iniciar sesión.');
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
    this.successMessage.set(null);

    try {
      await this.authService.loginWithGoogle();
      // En éxito el browser navega a Google; el callback maneja el resto.
    } catch {
      this.errorMessage.set('No se pudo iniciar sesión con Google. Intentá nuevamente.');
      this.loading.set(false);
    }
  }
}
