import { Component, ChangeDetectionStrategy, signal, inject, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink, Router, ActivatedRoute } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { isValidPhoneNumber } from 'libphonenumber-js';
import { AuthService } from '../../application/auth.service';
import { normalizePhone } from '../../application/phone.util';
import { EMAIL_RE } from '../../../shared/validation/email.validator';

@Component({
  selector: 'app-login',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, FormsModule, TranslatePipe],
  templateUrl: './login.html',
  styleUrl: './login.scss',
})
export class LoginComponent implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly translate = inject(TranslateService);

  protected readonly identifier = signal('');
  protected readonly password = signal('');
  protected readonly passwordVisible = signal(false);
  protected readonly loading = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly successMessage = signal<string | null>(null);

  ngOnInit(): void {
    if (this.route.snapshot.queryParamMap.get('reset') === 'success') {
      this.successMessage.set(this.translate.instant('auth.login.resetSuccess'));
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
      this.errorMessage.set(this.translate.instant('auth.login.errors.required'));
      return;
    }

    // Se valida el formato ANTES de llamar a Supabase — evita un roundtrip de red
    // por basura obviamente inválida y no filtra si la cuenta existe o no.
    const isEmailIdentifier = identifier.includes('@');
    const validIdentifier = isEmailIdentifier
      ? EMAIL_RE.test(identifier)
      : isValidPhoneNumber(normalizePhone(identifier));
    if (!validIdentifier) {
      this.errorMessage.set(this.translate.instant('auth.login.errors.invalidIdentifier'));
      return;
    }

    this.errorMessage.set(null);
    this.successMessage.set(null);
    this.loading.set(true);

    try {
      if (isEmailIdentifier) {
        await this.authService.loginWithPassword(identifier, password);
      } else {
        await this.authService.loginWithPhone(normalizePhone(identifier), password);
      }
      // El guard de ficha también espera esto, pero sin hacerlo acá también
      // el router ya arrancó la navegación con currentUser().role todavía
      // en null en el momento exacto en que el guard lo lee.
      await this.authService.waitForSync();
      await this.router.navigateByUrl('/dashboard');
    } catch (err) {
      this.errorMessage.set(
        err instanceof Error ? err.message : this.translate.instant('auth.login.errors.generic'),
      );
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
      this.errorMessage.set(this.translate.instant('auth.login.errors.googleFailed'));
      this.loading.set(false);
    }
  }
}
