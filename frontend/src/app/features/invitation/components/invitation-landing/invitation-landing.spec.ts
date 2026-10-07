import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { By } from '@angular/platform-browser';
import { HttpErrorResponse } from '@angular/common/http';
import { of, throwError } from 'rxjs';
import { provideTranslateService } from '@ngx-translate/core';
import { InvitationLandingComponent } from './invitation-landing';
import { PatientInvitesService } from '../../../patient-invites/services/patient-invites.service';
import { AuthService } from '../../../../auth/application/auth.service';
import { PhoneInputComponent } from '../../../../shared/ui/phone-input/phone-input';
import type { InviteStatusResponse } from '../../../patient-invites/models/invite.model';

const PASSWORD = 'Contrasena-segura-1';

interface SetupOptions {
  token?: string | null;
  status?: InviteStatusResponse;
  statusError?: boolean;
}

async function setup({
  token = 'tok-1',
  status = { valid: true, kind: 'doctor' },
  statusError = false,
}: SetupOptions = {}) {
  const invites = {
    checkStatus: vi
      .fn()
      .mockReturnValue(
        statusError ? throwError(() => new HttpErrorResponse({ status: 500 })) : of(status),
      ),
  };
  const auth = {
    loginWithGoogle: vi.fn().mockResolvedValue(undefined),
    registerWithPassword: vi.fn().mockResolvedValue(undefined),
    registerWithPhone: vi.fn().mockResolvedValue(undefined),
    loginWithPhone: vi.fn().mockResolvedValue(undefined),
    waitForSync: vi.fn().mockResolvedValue(undefined),
  };
  TestBed.configureTestingModule({
    providers: [
      provideRouter([
        { path: 'invitacion/:token', component: InvitationLandingComponent },
        { path: 'invitacion', component: InvitationLandingComponent },
      ]),
      provideTranslateService({ defaultLanguage: 'es' }),
      { provide: PatientInvitesService, useValue: invites },
      { provide: AuthService, useValue: auth },
    ],
  });
  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl(
    token ? `/invitacion/${token}` : '/invitacion',
    InvitationLandingComponent,
  );
  await harness.fixture.whenStable();
  harness.detectChanges();
  const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
  return { harness, invites, auth, navigate };
}

type Harness = Awaited<ReturnType<typeof setup>>['harness'];

function text(harness: Harness): string {
  return (harness.routeNativeElement as HTMLElement).textContent ?? '';
}

function el<T extends Element>(harness: Harness, selector: string): T {
  return (harness.routeNativeElement as HTMLElement).querySelector(selector) as T;
}

function fill(harness: Harness, selector: string, value: string): void {
  const input = el<HTMLInputElement>(harness, selector);
  input.value = value;
  input.dispatchEvent(new Event('input'));
}

/** El alta y el login son varias promesas encadenadas: deja correr la cola. */
async function flushPromises(harness: Harness): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await settle(harness);
}

async function settle(harness: Harness): Promise<void> {
  harness.detectChanges();
  await harness.fixture.whenStable();
  harness.detectChanges();
}

describe('InvitationLandingComponent', () => {
  afterEach(() => localStorage.clear());

  describe('copy by invitation kind (CLI-79)', () => {
    it('shows the team copy for a valid doctor invitation', async () => {
      const { harness, invites } = await setup({ status: { valid: true, kind: 'doctor' } });

      expect(invites.checkStatus).toHaveBeenCalledWith('tok-1');
      expect(text(harness)).toContain('Únete al equipo');
      expect(text(harness)).toContain('tu panel, tu agenda y las fichas de tus pacientes');
      expect(text(harness)).not.toContain('ver tus citas');
    });

    it('keeps the patient copy for a valid patient invitation', async () => {
      const { harness } = await setup({ status: { valid: true, kind: 'patient' } });

      expect(text(harness)).toContain('Completa tu registro');
      expect(text(harness)).toContain('ver tus citas y tu historial');
      expect(text(harness)).not.toContain('Únete al equipo');
    });

    it('treats a response without kind (older backend) as a patient invitation', async () => {
      const { harness } = await setup({ status: { valid: true } });

      expect(text(harness)).toContain('Completa tu registro');
    });

    it('tells an expired doctor link to ask the clinic administration, not a doctor', async () => {
      const { harness } = await setup({ status: { valid: false, kind: 'doctor' } });

      expect(text(harness)).toContain('Link no disponible');
      expect(text(harness)).toContain('Pídele a la administración de la clínica que te lo reenvíe');
      expect(text(harness)).not.toContain('Pídele al doctor');
    });

    it('keeps telling an expired patient link to ask the doctor', async () => {
      const { harness } = await setup({ status: { valid: false, kind: 'patient' } });

      expect(text(harness)).toContain('Pídele al doctor que te lo reenvíe');
    });

    it('uses the patient wording for a token that does not exist (no kind), revealing nothing else', async () => {
      const { harness } = await setup({ status: { valid: false } });

      expect(text(harness)).toContain('Link no disponible');
      expect(text(harness)).toContain('Pídele al doctor que te lo reenvíe');
      expect(text(harness)).not.toContain('administración');
    });
  });

  describe('link checks', () => {
    it('shows an invalid-link message and never calls the backend when the URL has no token', async () => {
      const { harness, invites } = await setup({ token: null });

      expect(invites.checkStatus).not.toHaveBeenCalled();
      expect(text(harness)).toContain('Este link de invitación no es válido.');
    });

    it('tells the visitor to try again later when the status check fails', async () => {
      const { harness } = await setup({ statusError: true });

      expect(text(harness)).toContain('No pudimos verificar el link');
    });
  });

  // Los tres caminos de registro de un doctor invitado (CLI-79). El aterrizaje
  // en el dashboard por rol lo resuelve patientProfileGuard (deja pasar a
  // odontologist/admin) y DashboardPage (elige el menú por rol).
  describe('registration paths for an invited doctor', () => {
    it('Google: remembers the token before leaving for the provider', async () => {
      const { harness, auth } = await setup();

      el<HTMLButtonElement>(harness, '.auth-form__google-btn').click();
      await settle(harness);

      expect(localStorage.getItem('pendingInviteToken')).toBe('tok-1');
      expect(auth.loginWithGoogle).toHaveBeenCalled();
    });

    it('email + password: remembers the token, creates the account and asks to confirm the email', async () => {
      const { harness, auth } = await setup();

      fill(harness, '#invite-email', 'Marylu@Example.com ');
      fill(harness, '#invite-password', PASSWORD);
      fill(harness, '#invite-confirm-password', PASSWORD);
      await settle(harness);
      el<HTMLFormElement>(harness, '.auth-form').dispatchEvent(new Event('submit'));
      await settle(harness);

      expect(auth.registerWithPassword).toHaveBeenCalledWith('marylu@example.com', PASSWORD);
      expect(localStorage.getItem('pendingInviteToken')).toBe('tok-1');
      expect(text(harness)).toContain('Revisa tu correo');
    });

    it('phone + password: creates the account, waits for the sync and lands on the dashboard', async () => {
      const { harness, auth, navigate } = await setup();

      el<HTMLButtonElement>(harness, '.channel-toggle__btn:nth-child(2)').click();
      await settle(harness);
      harness.fixture.debugElement
        .query(By.directive(PhoneInputComponent))
        .componentInstance.changed.emit({ e164: '+59170011122', valid: true });
      fill(harness, '#invite-password', PASSWORD);
      fill(harness, '#invite-confirm-password', PASSWORD);
      await settle(harness);
      el<HTMLFormElement>(harness, '.auth-form').dispatchEvent(new Event('submit'));
      await flushPromises(harness);

      expect(auth.registerWithPhone).toHaveBeenCalledWith('+59170011122', PASSWORD, 'tok-1');
      expect(auth.loginWithPhone).toHaveBeenCalledWith('+59170011122', PASSWORD);
      expect(auth.waitForSync).toHaveBeenCalled();
      expect(navigate).toHaveBeenCalledWith('/dashboard');
    });

    it('does not create the account when the passwords do not match', async () => {
      const { harness, auth } = await setup();

      fill(harness, '#invite-email', 'marylu@example.com');
      fill(harness, '#invite-password', PASSWORD);
      fill(harness, '#invite-confirm-password', `${PASSWORD}-otra`);
      await settle(harness);
      el<HTMLFormElement>(harness, '.auth-form').dispatchEvent(new Event('submit'));
      await settle(harness);

      expect(auth.registerWithPassword).not.toHaveBeenCalled();
      expect(localStorage.getItem('pendingInviteToken')).toBeNull();
    });

    // CLI-144: el teléfono de la ficha es el oficial.
    it('shows which number to use when the ficha has a phone', async () => {
      const { harness } = await setup({
        status: { valid: true, kind: 'patient', phoneHint: '665' },
      });

      el<HTMLButtonElement>(harness, '.channel-toggle__btn:nth-child(2)').click();
      await settle(harness);

      expect(text(harness)).toContain('terminado en 665');
    });

    it('shows no phone hint when the ficha has no phone', async () => {
      const { harness } = await setup({ status: { valid: true, kind: 'patient' } });

      el<HTMLButtonElement>(harness, '.channel-toggle__btn:nth-child(2)').click();
      await settle(harness);

      expect(harness.fixture.nativeElement.querySelector('.phone-hint')).toBeNull();
    });

    it('shows the backend message when the phone is not the one in the ficha (422)', async () => {
      const { harness, auth } = await setup({
        status: { valid: true, kind: 'patient', phoneHint: '665' },
      });
      auth.registerWithPhone.mockRejectedValue(
        new HttpErrorResponse({
          status: 422,
          error: {
            message: 'Regístrate con el número que diste en la clínica (terminado en 665).',
          },
        }),
      );

      el<HTMLButtonElement>(harness, '.channel-toggle__btn:nth-child(2)').click();
      await settle(harness);
      harness.fixture.debugElement
        .query(By.directive(PhoneInputComponent))
        .componentInstance.changed.emit({ e164: '+59170011122', valid: true });
      fill(harness, '#invite-password', PASSWORD);
      fill(harness, '#invite-confirm-password', PASSWORD);
      await settle(harness);
      el<HTMLFormElement>(harness, '.auth-form').dispatchEvent(new Event('submit'));
      await settle(harness);

      expect(text(harness)).toContain(
        'Regístrate con el número que diste en la clínica (terminado en 665).',
      );
      expect(localStorage.getItem('pendingInviteToken')).toBeNull();
    });

    it('falls back to a generic message on a 422 without a message', async () => {
      const { harness, auth } = await setup({ status: { valid: true, kind: 'patient' } });
      auth.registerWithPhone.mockRejectedValue(new HttpErrorResponse({ status: 422 }));

      el<HTMLButtonElement>(harness, '.channel-toggle__btn:nth-child(2)').click();
      await settle(harness);
      harness.fixture.debugElement
        .query(By.directive(PhoneInputComponent))
        .componentInstance.changed.emit({ e164: '+59170011122', valid: true });
      fill(harness, '#invite-password', PASSWORD);
      fill(harness, '#invite-confirm-password', PASSWORD);
      await settle(harness);
      el<HTMLFormElement>(harness, '.auth-form').dispatchEvent(new Event('submit'));
      await settle(harness);

      expect(text(harness)).toContain('Regístrate con el número que diste en la clínica.');
    });

    async function submitPhone(harness: Harness): Promise<void> {
      el<HTMLButtonElement>(harness, '.channel-toggle__btn:nth-child(2)').click();
      await settle(harness);
      harness.fixture.debugElement
        .query(By.directive(PhoneInputComponent))
        .componentInstance.changed.emit({ e164: '+59170011122', valid: true });
      fill(harness, '#invite-password', PASSWORD);
      fill(harness, '#invite-confirm-password', PASSWORD);
      await settle(harness);
      el<HTMLFormElement>(harness, '.auth-form').dispatchEvent(new Event('submit'));
      await flushPromises(harness);
    }

    // CLI-241: un intento anterior pudo crear la cuenta sin llegar a entrar.
    it('on 409 logs in with that password and keeps the token so the sync links the invite', async () => {
      const { harness, auth, navigate } = await setup();
      auth.registerWithPhone.mockRejectedValue(new HttpErrorResponse({ status: 409 }));

      await submitPhone(harness);

      expect(auth.loginWithPhone).toHaveBeenCalledWith('+59170011122', PASSWORD);
      expect(navigate).toHaveBeenCalledWith('/dashboard');
      expect(localStorage.getItem('pendingInviteToken')).toBe('tok-1');
    });

    it('on 409 with another password forgets the token and points to the login', async () => {
      const { harness, auth, navigate } = await setup();
      auth.registerWithPhone.mockRejectedValue(new HttpErrorResponse({ status: 409 }));
      auth.loginWithPhone.mockRejectedValue(new Error('Credenciales inválidas'));

      await submitPhone(harness);

      expect(text(harness)).toContain('Ese teléfono ya tiene una cuenta');
      expect(navigate).not.toHaveBeenCalled();
      expect(localStorage.getItem('pendingInviteToken')).toBeNull();
    });

    it('keeps the token when the account was created but the login failed', async () => {
      const { harness, auth, navigate } = await setup();
      auth.loginWithPhone.mockRejectedValue(new Error('red'));

      await submitPhone(harness);

      expect(text(harness)).toContain('Tu cuenta se creó, pero no pudimos iniciar sesión');
      expect(navigate).not.toHaveBeenCalled();
      expect(localStorage.getItem('pendingInviteToken')).toBe('tok-1');
    });

    it.each([
      [400, 'Revisa el número de teléfono.'],
      [403, 'Este link de registro venció o ya se usó'],
      [429, 'Hiciste demasiados intentos'],
      [503, 'No pudimos crear la cuenta en este momento'],
    ])('explains a %i from the backend and forgets the token', async (status, message) => {
      const { harness, auth } = await setup();
      auth.registerWithPhone.mockRejectedValue(new HttpErrorResponse({ status }));

      await submitPhone(harness);

      expect(text(harness)).toContain(message);
      expect(auth.loginWithPhone).not.toHaveBeenCalled();
      expect(localStorage.getItem('pendingInviteToken')).toBeNull();
    });
  });
});
