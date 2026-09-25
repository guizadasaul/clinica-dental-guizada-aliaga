import { Component, ChangeDetectionStrategy, computed, signal, inject, OnInit } from '@angular/core';
import { RouterLink, Router, ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../../../auth/application/auth.service';
import { PatientInvitesService } from '../../../patient-invites/services/patient-invites.service';
import type { InviteKind } from '../../../patient-invites/models/invite.model';
import { PhoneInputComponent } from '../../../../shared/ui/phone-input/phone-input';
import { isValidEmail, normalizeEmail } from '../../../../shared/validation/email.validator';
import { passwordsMatch, validatePassword } from '../../../../shared/validation/password.validator';

type RegisterMode = 'email' | 'phone';

interface InviteCopy {
  title: string;
  subtitle: string;
  /** Link vencido o ya usado: a quién hay que pedirle uno nuevo. */
  expired: string;
}

// El doctor invitado recibe el link del administrador, no de otro doctor
// (CLI-79). Un token que no existe no dice a quién iba dirigido: cae en el
// copy de paciente, igual que antes de esta issue.
const INVITE_COPY: Record<InviteKind, InviteCopy> = {
  patient: {
    title: 'Completá tu registro',
    subtitle: 'Creá tu cuenta para ver tus citas y tu historial.',
    expired: 'Este link venció o ya fue usado. Pedile al doctor que te lo reenvíe.',
  },
  doctor: {
    title: 'Sumate al equipo',
    subtitle: 'Creá tu acceso para entrar a tu panel, tu agenda y las fichas de tus pacientes.',
    expired:
      'Este link venció o ya fue usado. Pedile a la administración de la clínica que te lo reenvíe.',
  },
};

@Component({
  selector: 'app-invitation-landing',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, FormsModule, PhoneInputComponent],
  templateUrl: './invitation-landing.html',
  styleUrl: './invitation-landing.scss',
})
export class InvitationLandingComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly patientInvitesService = inject(PatientInvitesService);
  private readonly authService = inject(AuthService);

  private token: string | null = null;

  protected readonly loading = signal(true);
  protected readonly valid = signal(false);
  protected readonly kind = signal<InviteKind>('patient');
  protected readonly copy = computed(() => INVITE_COPY[this.kind()]);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly connecting = signal(false);

  protected readonly mode = signal<RegisterMode>('email');
  protected readonly email = signal('');
  protected readonly phoneE164 = signal('');
  protected readonly phoneValid = signal(false);
  protected readonly password = signal('');
  protected readonly confirmPassword = signal('');
  protected readonly passwordVisible = signal(false);
  protected readonly formLoading = signal(false);
  protected readonly registered = signal(false);

  // Gatea el botón de submit en tiempo real — no reemplaza la revalidación
  // dentro de onSubmit, que es la que de verdad decide si se manda algo.
  protected readonly canSubmit = computed(() => {
    if (validatePassword(this.password()) !== null) return false;
    if (passwordsMatch(this.password(), this.confirmPassword()) !== null) return false;
    return this.mode() === 'email'
      ? isValidEmail(this.email())
      : this.phoneValid() && this.phoneE164().length > 0;
  });

  ngOnInit(): void {
    void this.checkInvite();
  }

  /** Valida el token del link antes de mostrar el registro. */
  private async checkInvite(): Promise<void> {
    this.token = this.route.snapshot.paramMap.get('token');
    if (!this.token) {
      this.errorMessage.set('Este link de invitación no es válido.');
      this.loading.set(false);
      return;
    }

    try {
      const result = await firstValueFrom(this.patientInvitesService.checkStatus(this.token));
      this.valid.set(result.valid);
      this.kind.set(result.kind ?? 'patient');
      if (!result.valid) {
        this.errorMessage.set(this.copy().expired);
      }
    } catch {
      this.errorMessage.set('No pudimos verificar el link. Intentá de nuevo más tarde.');
    } finally {
      this.loading.set(false);
    }
  }

  protected async onContinueWithGoogle(): Promise<void> {
    if (!this.token || this.connecting()) {
      return;
    }
    this.connecting.set(true);
    try {
      localStorage.setItem('pendingInviteToken', this.token);
      await this.authService.loginWithGoogle();
      // En éxito el browser navega a Google; el callback maneja el resto.
    } catch {
      localStorage.removeItem('pendingInviteToken');
      this.errorMessage.set('No se pudo conectar con Google. Intentá nuevamente.');
      this.connecting.set(false);
    }
  }

  protected setMode(mode: RegisterMode): void {
    if (this.mode() === mode) {
      return;
    }
    this.mode.set(mode);
    this.errorMessage.set(null);
  }

  protected onPhoneChanged(event: { e164: string; valid: boolean }): void {
    this.phoneE164.set(event.e164);
    this.phoneValid.set(event.valid);
  }

  protected togglePasswordVisibility(): void {
    this.passwordVisible.update((v) => !v);
  }

  protected async onSubmit(): Promise<void> {
    if (!this.token || this.formLoading()) {
      return;
    }

    const password = this.password();
    const passwordError = validatePassword(password);
    if (passwordError) {
      this.errorMessage.set(passwordError);
      return;
    }
    const matchError = passwordsMatch(password, this.confirmPassword());
    if (matchError) {
      this.errorMessage.set(matchError);
      return;
    }

    if (this.mode() === 'email') {
      const email = normalizeEmail(this.email());
      if (!isValidEmail(email)) {
        this.errorMessage.set('Ingresá un correo válido.');
        return;
      }
      this.email.set(email);
      await this.submitEmail(this.token, email, password);
      return;
    }

    if (!this.phoneValid() || !this.phoneE164()) {
      this.errorMessage.set('Ingresá un número de teléfono válido.');
      return;
    }
    await this.submitPhone(this.token, this.phoneE164(), password);
  }

  private async submitEmail(token: string, email: string, password: string): Promise<void> {
    this.errorMessage.set(null);
    this.formLoading.set(true);
    // Igual que onContinueWithGoogle: el token queda guardado ANTES de crear
    // la cuenta, para que syncWithBackend lo encuentre apenas se confirme por correo.
    localStorage.setItem('pendingInviteToken', token);
    try {
      await this.authService.registerWithPassword(email, password);
      this.registered.set(true);
    } catch (err) {
      localStorage.removeItem('pendingInviteToken');
      this.errorMessage.set(err instanceof Error ? err.message : 'No se pudo crear la cuenta.');
    } finally {
      this.formLoading.set(false);
    }
  }

  private async submitPhone(token: string, phoneE164: string, password: string): Promise<void> {
    this.errorMessage.set(null);
    this.formLoading.set(true);
    localStorage.setItem('pendingInviteToken', token);
    try {
      await this.authService.registerWithPhone(phoneE164, password, token);
      // waitForSync, no authReady: authReady ya está resuelta desde que
      // arrancó la app (esta pantalla no es una carga fresca) — no sirve
      // para esperar el sync nuevo que recién disparó este registro, y sin
      // esperarlo el guard de ficha puede leer currentUser().role todavía
      // en null y mandar a la landing aunque el link haya sido válido.
      await this.authService.waitForSync();
      await this.router.navigateByUrl('/dashboard');
    } catch (err) {
      localStorage.removeItem('pendingInviteToken');
      if (err instanceof HttpErrorResponse && err.status === 409) {
        this.errorMessage.set('Ese teléfono ya está registrado.');
      } else {
        this.errorMessage.set(err instanceof Error ? err.message : 'No se pudo crear la cuenta.');
      }
    } finally {
      this.formLoading.set(false);
    }
  }
}
