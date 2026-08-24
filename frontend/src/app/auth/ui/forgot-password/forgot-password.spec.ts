import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ForgotPasswordComponent } from './forgot-password';
import { AuthService } from '../../application/auth.service';

function createAuthServiceStub(overrides: Record<string, unknown> = {}) {
  return {
    requestPasswordReset: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function setup(authService: ReturnType<typeof createAuthServiceStub>) {
  TestBed.configureTestingModule({
    imports: [ForgotPasswordComponent],
    providers: [provideRouter([]), { provide: AuthService, useValue: authService }],
  });
  return TestBed.createComponent(ForgotPasswordComponent);
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
  fixture.detectChanges();
}

const EMAIL_INPUT = '#forgot-password-email';
const FIELD_ERROR = '.auth-form__field-error';
const TITLE = '.login-card__title';
const RESEND_BUTTON = '.auth-form__link';

describe('ForgotPasswordComponent', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('bloquea el envío con un email de formato inválido sin llamar al service', async () => {
    const authService = createAuthServiceStub();
    const fixture = setup(authService);
    await settle(fixture);

    type(el(fixture, EMAIL_INPUT), 'no-es-un-correo');
    submitForm(fixture);
    await settle(fixture);

    expect(el(fixture, FIELD_ERROR)?.textContent).toContain('correo válido');
    expect(authService.requestPasswordReset).not.toHaveBeenCalled();
  });

  it('con un email válido llama al service y siempre muestra el mensaje genérico, incluso si el service no-opea en silencio', async () => {
    const authService = createAuthServiceStub();
    const fixture = setup(authService);
    await settle(fixture);

    type(el(fixture, EMAIL_INPUT), 'maria@correo.com');
    submitForm(fixture);
    await settle(fixture);

    expect(authService.requestPasswordReset).toHaveBeenCalledWith('maria@correo.com');
    expect(el(fixture, TITLE)?.textContent).toContain('Revisá tu correo');
  });

  it('tras enviar, deshabilita el reenvío con cuenta regresiva de 60s', async () => {
    vi.useFakeTimers();
    const authService = createAuthServiceStub();
    const fixture = setup(authService);
    await settle(fixture);

    type(el(fixture, EMAIL_INPUT), 'maria@correo.com');
    submitForm(fixture);
    await settle(fixture);

    const resendButton = el<HTMLButtonElement>(fixture, RESEND_BUTTON);
    expect(resendButton.disabled).toBe(true);
    expect(resendButton.textContent).toContain('60s');

    await vi.advanceTimersByTimeAsync(60_000);
    await settle(fixture);

    expect(el<HTMLButtonElement>(fixture, RESEND_BUTTON).disabled).toBe(false);
  });
});
