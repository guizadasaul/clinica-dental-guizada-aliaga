import { Component, ChangeDetectionStrategy, signal, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../application/auth.service';
import { LogoComponent } from '../../../shared/ui/logo/logo';

@Component({
  selector: 'app-forgot-password',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, FormsModule, LogoComponent],
  templateUrl: './forgot-password.html',
  styleUrl: './forgot-password.scss',
})
export class ForgotPasswordComponent {
  private readonly authService = inject(AuthService);

  protected readonly email = signal('');
  protected readonly loading = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly submitted = signal(false);

  protected async onSubmit(): Promise<void> {
    if (this.loading()) {
      return;
    }

    const email = this.email().trim();
    if (!email) {
      this.errorMessage.set('Ingresá tu correo.');
      return;
    }

    this.errorMessage.set(null);
    this.loading.set(true);

    try {
      await this.authService.requestPasswordReset(email);
    } finally {
      this.loading.set(false);
      this.submitted.set(true);
    }
  }
}
