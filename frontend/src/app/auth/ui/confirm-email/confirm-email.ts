import { Component, ChangeDetectionStrategy, signal, inject, OnInit } from '@angular/core';
import { RouterLink, Router, ActivatedRoute } from '@angular/router';
import { AuthService } from '../../application/auth.service';
import { isValidEmail, normalizeEmail } from '../../../shared/validation/email.validator';

type ConfirmState = 'confirming' | 'failed' | 'confirmed-no-session';

/**
 * Destino del link "Confirmar mi correo" que manda el backend (CLI-242).
 * Confirma con el token_hash del link (verifyOtp), así funciona en cualquier
 * navegador o celular, y entra directo al portal: la ficha ya quedó
 * vinculada cuando se creó la cuenta.
 */
@Component({
  selector: 'app-confirm-email',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  templateUrl: './confirm-email.html',
  styleUrl: './confirm-email.scss',
})
export class ConfirmEmailComponent implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly state = signal<ConfirmState>('confirming');
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly resendEmail = signal('');
  protected readonly resendState = signal<'idle' | 'sending' | 'sent' | 'invalid'>('idle');

  ngOnInit(): void {
    void this.confirm();
  }

  private async confirm(): Promise<void> {
    const tokenHash = this.route.snapshot.queryParamMap.get('token_hash');
    if (!tokenHash) {
      this.fail('Este enlace de confirmación no es válido.');
      return;
    }
    await this.auth.authReady;
    try {
      await this.auth.confirmEmail(tokenHash);
    } catch (err) {
      this.fail(err instanceof Error ? err.message : 'El enlace de confirmación venció o ya se usó.');
      return;
    }
    await this.auth.waitForSync();
    if (this.auth.currentUser()) {
      await this.router.navigateByUrl('/dashboard', { replaceUrl: true });
      return;
    }
    // Confirmado, pero el sync no devolvió una cuenta: que entre a mano.
    this.state.set('confirmed-no-session');
  }

  protected onEmailInput(event: Event): void {
    this.resendEmail.set((event.target as HTMLInputElement).value);
    if (this.resendState() === 'invalid') this.resendState.set('idle');
  }

  protected async resend(event: Event): Promise<void> {
    event.preventDefault();
    const email = normalizeEmail(this.resendEmail());
    if (!isValidEmail(email)) {
      this.resendState.set('invalid');
      return;
    }
    this.resendState.set('sending');
    try {
      await this.auth.resendEmailConfirmation(email);
    } finally {
      // Siempre el mismo aviso: no revela si el correo tiene una cuenta.
      this.resendState.set('sent');
    }
  }

  private fail(message: string): void {
    this.errorMessage.set(message);
    this.state.set('failed');
  }
}
