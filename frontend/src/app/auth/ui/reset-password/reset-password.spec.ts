import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { ResetPasswordComponent } from './reset-password';
import { AuthService } from '../../application/auth.service';

function createAuthServiceStub(overrides: Record<string, unknown> = {}) {
  return {
    authReady: Promise.resolve(),
    hasRecoverySession: vi.fn().mockResolvedValue(true),
    updatePassword: vi.fn().mockResolvedValue(undefined),
    logout: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function setup(authService: ReturnType<typeof createAuthServiceStub>) {
  TestBed.configureTestingModule({
    imports: [ResetPasswordComponent],
    providers: [provideRouter([]), { provide: AuthService, useValue: authService }],
  });
  return TestBed.createComponent(ResetPasswordComponent);
}

function el<T extends Element>(fixture: ReturnType<typeof setup>, selector: string): T {
  return (fixture.nativeElement as HTMLElement).querySelector(selector) as T;
}

function type(input: HTMLInputElement, value: string): void {
  input.value = value;
  input.dispatchEvent(new Event('input'));
}

function submitForm(fixture: ReturnType<typeof setup>): void {
  el<HTMLFormElement>(fixture, 'form').dispatchEvent(new Event('submit'));
}

async function settle(fixture: ReturnType<typeof setup>): Promise<void> {
  fixture.detectChanges();
  await fixture.whenStable();
  // ngOnInit encadena dos awaits (authReady, luego hasRecoverySession) antes
  // de tocar checkingSession/sessionValid — sin zone.js, whenStable() no
  // siempre alcanza a esperar esa cadena completa, así que se fuerza el
  // drenado de la cola de microtareas explícitamente.
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  fixture.detectChanges();
}

const NEW_PASSWORD_INPUT = '#reset-password-new';
const CONFIRM_PASSWORD_INPUT = '#reset-password-confirm';
const TITLE = '.login-card__title';
const FIELD_ERROR = '.auth-form__field-error';

describe('ResetPasswordComponent', () => {
  it('muestra "Enlace inválido" cuando no hay una sesión de recuperación válida', async () => {
    const authService = createAuthServiceStub({
      hasRecoverySession: vi.fn().mockResolvedValue(false),
    });
    const fixture = setup(authService);
    await settle(fixture);

    expect(el(fixture, TITLE)?.textContent).toContain('Enlace inválido');
    expect(el(fixture, 'form')).toBeNull();
  });

  it('rechaza una contraseña corta sin llamar a updatePassword', async () => {
    const authService = createAuthServiceStub();
    const fixture = setup(authService);
    await settle(fixture);

    type(el(fixture, NEW_PASSWORD_INPUT), '123');
    type(el(fixture, CONFIRM_PASSWORD_INPUT), '123');
    submitForm(fixture);
    await settle(fixture);

    expect(el(fixture, FIELD_ERROR)?.textContent).toContain('al menos 8');
    expect(authService.updatePassword).not.toHaveBeenCalled();
  });

  it('rechaza contraseñas que no coinciden sin llamar a updatePassword', async () => {
    const authService = createAuthServiceStub();
    const fixture = setup(authService);
    await settle(fixture);

    type(el(fixture, NEW_PASSWORD_INPUT), 'contraseñaValida1');
    type(el(fixture, CONFIRM_PASSWORD_INPUT), 'otraDistinta1');
    submitForm(fixture);
    await settle(fixture);

    expect(el(fixture, FIELD_ERROR)?.textContent).toContain('no coinciden');
    expect(authService.updatePassword).not.toHaveBeenCalled();
  });

  it('happy path: actualiza la contraseña, cierra sesión y navega a login con reset=success', async () => {
    const authService = createAuthServiceStub();
    const fixture = setup(authService);
    const router = TestBed.inject(Router);
    const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    await settle(fixture);

    type(el(fixture, NEW_PASSWORD_INPUT), 'contraseñaValida1');
    type(el(fixture, CONFIRM_PASSWORD_INPUT), 'contraseñaValida1');
    submitForm(fixture);
    await settle(fixture);

    expect(authService.updatePassword).toHaveBeenCalledWith('contraseñaValida1');
    expect(authService.logout).toHaveBeenCalled();
    expect(navigateSpy).toHaveBeenCalledWith(['/auth/login'], { queryParams: { reset: 'success' } });
  });
});
