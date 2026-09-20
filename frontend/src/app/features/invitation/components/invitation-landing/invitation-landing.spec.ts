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

async function setup({ token = 'tok-1', status = { valid: true, kind: 'doctor' }, statusError = false }: SetupOptions = {}) {
  const invites = {
    checkStatus: vi.fn().mockReturnValue(statusError ? throwError(() => new HttpErrorResponse({ status: 500 })) : of(status)),
  };
  const auth = {
    loginWithGoogle: vi.fn().mockResolvedValue(undefined),
    registerWithPassword: vi.fn().mockResolvedValue(undefined),
    registerWithPhone: vi.fn().mockResolvedValue(undefined),
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
  await harness.navigateByUrl(token ? `/invitacion/${token}` : '/invitacion', InvitationLandingComponent);
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
      expect(text(harness)).toContain('Sumate al equipo');
      expect(text(harness)).toContain('tu panel, tu agenda y las fichas de tus pacientes');
      expect(text(harness)).not.toContain('ver tus citas');
    });

    it('keeps the patient copy for a valid patient invitation', async () => {
      const { harness } = await setup({ status: { valid: true, kind: 'patient' } });

      expect(text(harness)).toContain('Completá tu registro');
      expect(text(harness)).toContain('ver tus citas y tu historial');
      expect(text(harness)).not.toContain('Sumate al equipo');
    });

    it('treats a response without kind (older backend) as a patient invitation', async () => {
      const { harness } = await setup({ status: { valid: true } });

      expect(text(harness)).toContain('Completá tu registro');
    });

    it('tells an expired doctor link to ask the clinic administration, not a doctor', async () => {
      const { harness } = await setup({ status: { valid: false, kind: 'doctor' } });

      expect(text(harness)).toContain('Link no disponible');
      expect(text(harness)).toContain('Pedile a la administración de la clínica que te lo reenvíe');
      expect(text(harness)).not.toContain('Pedile al doctor');
    });

    it('keeps telling an expired patient link to ask the doctor', async () => {
      const { harness } = await setup({ status: { valid: false, kind: 'patient' } });

      expect(text(harness)).toContain('Pedile al doctor que te lo reenvíe');
    });

    it('uses the patient wording for a token that does not exist (no kind), revealing nothing else', async () => {
      const { harness } = await setup({ status: { valid: false } });

      expect(text(harness)).toContain('Link no disponible');
      expect(text(harness)).toContain('Pedile al doctor que te lo reenvíe');
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
      (el<HTMLFormElement>(harness, '.auth-form')).dispatchEvent(new Event('submit'));
      await settle(harness);

      expect(auth.registerWithPassword).toHaveBeenCalledWith('marylu@example.com', PASSWORD);
      expect(localStorage.getItem('pendingInviteToken')).toBe('tok-1');
      expect(text(harness)).toContain('Revisá tu correo');
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
      (el<HTMLFormElement>(harness, '.auth-form')).dispatchEvent(new Event('submit'));
      await settle(harness);

      expect(auth.registerWithPhone).toHaveBeenCalledWith('+59170011122', PASSWORD);
      expect(auth.waitForSync).toHaveBeenCalled();
      expect(navigate).toHaveBeenCalledWith('/dashboard');
    });

    it('does not create the account when the passwords do not match', async () => {
      const { harness, auth } = await setup();

      fill(harness, '#invite-email', 'marylu@example.com');
      fill(harness, '#invite-password', PASSWORD);
      fill(harness, '#invite-confirm-password', `${PASSWORD}-otra`);
      await settle(harness);
      (el<HTMLFormElement>(harness, '.auth-form')).dispatchEvent(new Event('submit'));
      await settle(harness);

      expect(auth.registerWithPassword).not.toHaveBeenCalled();
      expect(localStorage.getItem('pendingInviteToken')).toBeNull();
    });

    it('forgets the token and explains it when the phone is already registered (409)', async () => {
      const { harness, auth } = await setup();
      auth.registerWithPhone.mockRejectedValue(new HttpErrorResponse({ status: 409 }));

      el<HTMLButtonElement>(harness, '.channel-toggle__btn:nth-child(2)').click();
      await settle(harness);
      harness.fixture.debugElement
        .query(By.directive(PhoneInputComponent))
        .componentInstance.changed.emit({ e164: '+59170011122', valid: true });
      fill(harness, '#invite-password', PASSWORD);
      fill(harness, '#invite-confirm-password', PASSWORD);
      await settle(harness);
      (el<HTMLFormElement>(harness, '.auth-form')).dispatchEvent(new Event('submit'));
      await settle(harness);

      expect(text(harness)).toContain('Ese teléfono ya está registrado.');
      expect(localStorage.getItem('pendingInviteToken')).toBeNull();
    });
  });
});
