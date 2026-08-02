import { Component, ChangeDetectionStrategy, signal, inject } from '@angular/core';
import { RouterLink, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../../../auth/application/auth.service';

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
  private readonly router = inject(Router);

  protected readonly loading = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  protected fullName = '';
  protected phone = '';
  protected password = '';
  protected confirmPassword = '';

  protected async onSubmit(): Promise<void> {
    if (this.loading()) {
      return;
    }

    if (this.password !== this.confirmPassword) {
      this.errorMessage.set('Las contraseñas no coinciden.');
      return;
    }

    if (this.password.length < 8) {
      this.errorMessage.set('La contraseña debe tener al menos 8 caracteres.');
      return;
    }

    this.loading.set(true);
    this.errorMessage.set(null);

    try {
      await this.authService.registerWithPhone(this.fullName, this.phone, this.password);
      await this.router.navigate(['/dashboard']);
    } catch (error: unknown) {
      const status = (error as { status?: number })?.status;
      if (status === 409) {
        this.errorMessage.set('Ese número de teléfono ya está registrado.');
      } else {
        this.errorMessage.set('No se pudo crear la cuenta. Intentá nuevamente.');
      }
    } finally {
      this.loading.set(false);
    }
  }
}
