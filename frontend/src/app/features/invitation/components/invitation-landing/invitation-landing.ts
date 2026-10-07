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
    title: 'Completa tu registro',
    subtitle: 'Crea tu cuenta para ver tus citas y tu historial.',
    expired: 'Este link venció o ya fue usado. Pídele al doctor que te lo reenvíe.',
  },
  doctor: {
    title: 'Únete al equipo',
    subtitle: 'Crea tu acceso para entrar a tu panel, tu agenda y las fichas de tus pacientes.',
    expired:
      'Este link venció o ya fue usado. Pídele a la administración de la clínica que te lo reenvíe.',
  },
};

/** Mensaje para cada error del alta por correo (CLI-242). */
function emailRegistrationError(err: unknown): string {
  if (!(err instanceof HttpErrorResponse)) {
    return err instanceof Error ? err.message : 'No se pudo crear la cuenta.';
  }
  switch (err.status) {
    case 400:
      return 'Revisa el correo y que la contraseña tenga entre 8 y 72 caracteres.';
    case 403:
      return 'Este link de registro venció o ya se usó. Pídele a la clínica uno nuevo.';
    case 409:
      // Correo ya registrado: el backend dice qué hacer.
      return typeof err.error?.message === 'string'
        ? err.error.message
        : 'Ese correo ya tiene una cuenta. Inicia sesión o recupera tu contraseña.';
    case 429:
      return 'Hiciste demasiados intentos. Espera un momento y vuelve a intentarlo.';
    default:
      return 'No pudimos crear la cuenta en este momento. Intenta de nuevo en unos minutos.';
  }
}

/** Mensaje para cada error del alta por teléfono (CLI-241). */
function phoneRegistrationError(err: unknown): string {
  if (!(err instanceof HttpErrorResponse)) {
    return err instanceof Error ? err.message : 'No se pudo crear la cuenta.';
  }
  switch (err.status) {
    case 400:
      return 'Revisa el número de teléfono.';
    case 403:
      return 'Este link de registro venció o ya se usó. Pídele a la clínica uno nuevo.';
    case 422:
      // El número no es el de la ficha (CLI-144): el backend dice cuál usar.
      return typeof err.error?.message === 'string'
        ? err.error.message
        : 'Regístrate con el número que diste en la clínica.';
    case 429:
      return 'Hiciste demasiados intentos. Espera un momento y vuelve a intentarlo.';
    default:
      return 'No pudimos crear la cuenta en este momento. Intenta de nuevo en unos minutos.';
  }
}

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
  protected readonly phoneHint = signal<string | null>(null);
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
  protected readonly resendState = signal<'idle' | 'sending' | 'sent' | 'error'>('idle');

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
      this.phoneHint.set(result.phoneHint ?? null);
      if (!result.valid) {
        this.errorMessage.set(this.copy().expired);
      }
    } catch {
      this.errorMessage.set('No pudimos verificar el link. Intenta de nuevo más tarde.');
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
      this.errorMessage.set('No se pudo conectar con Google. Intenta nuevamente.');
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
        this.errorMessage.set('Ingresa un correo válido.');
        return;
      }
      this.email.set(email);
      await this.submitEmail(this.token, email, password);
      return;
    }

    if (!this.phoneValid() || !this.phoneE164()) {
      this.errorMessage.set('Ingresa un número de teléfono válido.');
      return;
    }
    await this.submitPhone(this.token, this.phoneE164(), password);
  }

  private async submitEmail(token: string, email: string, password: string): Promise<void> {
    this.errorMessage.set(null);
    this.formLoading.set(true);
    // Sin pendingInviteToken: el backend canjea la invitación al crear la
    // cuenta (CLI-242), no al confirmar el correo.
    try {
      await this.authService.registerWithEmail(email, password, token);
      this.registered.set(true);
    } catch (err) {
      this.errorMessage.set(emailRegistrationError(err));
    } finally {
      this.formLoading.set(false);
    }
  }

  /** "Reenviar correo" en la pantalla de "Revisa tu correo" (CLI-242). */
  protected async resendConfirmation(): Promise<void> {
    if (this.resendState() === 'sending') return;
    this.resendState.set('sending');
    try {
      await this.authService.resendEmailConfirmation(this.email());
      this.resendState.set('sent');
    } catch {
      this.resendState.set('error');
    }
  }

  private async submitPhone(token: string, phoneE164: string, password: string): Promise<void> {
    this.errorMessage.set(null);
    this.formLoading.set(true);
    // El token queda guardado hasta que el sync lo canjee: si la cuenta se crea
    // pero el login falla, entrar después desde "Iniciar sesión" la vincula igual.
    localStorage.setItem('pendingInviteToken', token);
    try {
      try {
        await this.authService.registerWithPhone(phoneE164, password, token);
      } catch (err) {
        // 409: el teléfono ya tiene una cuenta (por ejemplo, un intento
        // anterior que se creó pero no llegó a entrar). Si la contraseña es
        // la de esa cuenta, se entra y el sync vincula la invitación.
        if (err instanceof HttpErrorResponse && err.status === 409) {
          if (await this.enterWithPhone(phoneE164, password)) return;
          localStorage.removeItem('pendingInviteToken');
          this.errorMessage.set(
            'Ese teléfono ya tiene una cuenta. Entra desde "Iniciar sesión" con tu contraseña.',
          );
          return;
        }
        localStorage.removeItem('pendingInviteToken');
        this.errorMessage.set(phoneRegistrationError(err));
        return;
      }
      if (!(await this.enterWithPhone(phoneE164, password))) {
        this.errorMessage.set(
          'Tu cuenta se creó, pero no pudimos iniciar sesión. Entra desde "Iniciar sesión" con tu teléfono y contraseña.',
        );
      }
    } finally {
      this.formLoading.set(false);
    }
  }

  /** Inicia sesión y entra al portal; false si el login falla. */
  private async enterWithPhone(phoneE164: string, password: string): Promise<boolean> {
    try {
      await this.authService.loginWithPhone(phoneE164, password);
    } catch {
      return false;
    }
    // waitForSync, no authReady: authReady ya está resuelta desde que
    // arrancó la app (esta pantalla no es una carga fresca) — no sirve
    // para esperar el sync nuevo que recién disparó este login, y sin
    // esperarlo el guard de ficha puede leer currentUser().role todavía
    // en null y mandar a la landing aunque el link haya sido válido.
    await this.authService.waitForSync();
    await this.router.navigateByUrl('/dashboard');
    return true;
  }
}
