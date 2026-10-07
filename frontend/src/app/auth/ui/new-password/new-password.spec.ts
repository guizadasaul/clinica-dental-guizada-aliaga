import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { NewPasswordComponent } from './new-password';
import { PasswordResetLinkService } from '../../application/password-reset-link.service';

function createServiceStub(overrides: Record<string, unknown> = {}) {
  return {
    checkStatus: vi.fn().mockReturnValue(of({ valid: true, phoneHint: '244' })),
    resetPassword: vi.fn().mockReturnValue(of(undefined)),
    ...overrides,
  };
}

function setup(service: ReturnType<typeof createServiceStub>, token: string | null = 'tok') {
  TestBed.configureTestingModule({
    imports: [NewPasswordComponent],
    providers: [
      provideRouter([]),
      { provide: PasswordResetLinkService, useValue: service },
      {
        provide: ActivatedRoute,
        useValue: { snapshot: { paramMap: convertToParamMap(token ? { token } : {}) } },
      },
    ],
  });
  return TestBed.createComponent(NewPasswordComponent);
}

function el<T extends Element>(fixture: ReturnType<typeof setup>, selector: string): T {
  return (fixture.nativeElement as HTMLElement).querySelector(selector) as T;
}

function text(fixture: ReturnType<typeof setup>): string {
  return (fixture.nativeElement as HTMLElement).textContent ?? '';
}

function type(input: HTMLInputElement, value: string): void {
  input.value = value;
  input.dispatchEvent(new Event('input'));
}

async function settle(fixture: ReturnType<typeof setup>): Promise<void> {
  fixture.detectChanges();
  await fixture.whenStable();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  fixture.detectChanges();
}

async function fillAndSubmit(fixture: ReturnType<typeof setup>, password = 'una-clave-nueva') {
  type(el(fixture, '#new-password-value'), password);
  type(el(fixture, '#new-password-confirm'), password);
  el<HTMLFormElement>(fixture, 'form').dispatchEvent(new Event('submit'));
  await settle(fixture);
}

const TITLE = '.login-card__title';

describe('NewPasswordComponent (CLI-244)', () => {
  it('con el link vigente muestra el formulario y a qué teléfono corresponde', async () => {
    const service = createServiceStub();
    const fixture = setup(service);

    await settle(fixture);

    expect(service.checkStatus).toHaveBeenCalledWith('tok');
    expect(el(fixture, TITLE).textContent).toContain('Nueva contraseña');
    expect(text(fixture)).toContain('terminado en 244');
  });

  it('sin pista de teléfono usa un subtítulo genérico', async () => {
    const fixture = setup(
      createServiceStub({ checkStatus: vi.fn().mockReturnValue(of({ valid: true })) }),
    );

    await settle(fixture);

    expect(text(fixture)).toContain('Elige la contraseña con la que vas a entrar');
  });

  it('con el link vencido o usado muestra "Enlace inválido" y pide uno nuevo a la clínica', async () => {
    const fixture = setup(
      createServiceStub({ checkStatus: vi.fn().mockReturnValue(of({ valid: false })) }),
    );

    await settle(fixture);

    expect(el(fixture, TITLE).textContent).toContain('Enlace inválido');
    expect(text(fixture)).toContain('Pídele a la clínica uno nuevo');
    expect(el(fixture, 'form')).toBeNull();
  });

  it('sin token en la ruta no consulta nada y muestra el link como inválido', async () => {
    const service = createServiceStub();
    const fixture = setup(service, null);

    await settle(fixture);

    expect(service.checkStatus).not.toHaveBeenCalled();
    expect(el(fixture, TITLE).textContent).toContain('Enlace inválido');
  });

  it('si no se pudo verificar el link lo dice', async () => {
    const fixture = setup(
      createServiceStub({
        checkStatus: vi.fn().mockReturnValue(throwError(() => new Error('red'))),
      }),
    );

    await settle(fixture);

    expect(text(fixture)).toContain('No pudimos verificar el enlace');
  });

  it('guarda la contraseña y manda al login con el aviso de éxito', async () => {
    const service = createServiceStub();
    const fixture = setup(service);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    await settle(fixture);

    await fillAndSubmit(fixture);

    expect(service.resetPassword).toHaveBeenCalledWith('tok', 'una-clave-nueva');
    expect(navigate).toHaveBeenCalledWith(['/auth/login'], { queryParams: { reset: 'success' } });
  });

  it('no manda nada si la contraseña es corta o no coincide', async () => {
    const service = createServiceStub();
    const fixture = setup(service);
    await settle(fixture);

    await fillAndSubmit(fixture, 'corta');
    type(el(fixture, '#new-password-value'), 'una-clave-nueva');
    type(el(fixture, '#new-password-confirm'), 'otra-clave-nueva');
    el<HTMLFormElement>(fixture, 'form').dispatchEvent(new Event('submit'));
    await settle(fixture);

    expect(service.resetPassword).not.toHaveBeenCalled();
    expect(el(fixture, '.auth-form__field-error')).not.toBeNull();
  });

  it('si el link venció mientras escribía, pasa a "Enlace inválido"', async () => {
    const fixture = setup(
      createServiceStub({
        resetPassword: vi
          .fn()
          .mockReturnValue(throwError(() => new HttpErrorResponse({ status: 403 }))),
      }),
    );
    await settle(fixture);

    await fillAndSubmit(fixture);

    expect(el(fixture, TITLE).textContent).toContain('Enlace inválido');
  });

  it.each([
    [
      new HttpErrorResponse({
        status: 400,
        error: { message: 'Esa contraseña es muy fácil de adivinar. Elige otra.' },
      }),
      'muy fácil de adivinar',
    ],
    [
      new HttpErrorResponse({ status: 400, error: { message: ['password too short'] } }),
      'entre 8 y 72 caracteres',
    ],
    [new HttpErrorResponse({ status: 429 }), 'demasiados intentos'],
    [new HttpErrorResponse({ status: 503 }), 'No pudimos guardar la contraseña'],
    [new Error('otro'), 'No se pudo guardar la contraseña'],
  ])('muestra el motivo del error y deja reintentar (%#)', async (err, expected) => {
    const service = createServiceStub({
      resetPassword: vi.fn().mockReturnValue(throwError(() => err)),
    });
    const fixture = setup(service);
    await settle(fixture);

    await fillAndSubmit(fixture);

    expect(el(fixture, '.login-card__error').textContent).toContain(expected);
    expect(el<HTMLButtonElement>(fixture, 'button[type="submit"]').disabled).toBe(false);
  });

  it('el botón del ojo muestra y oculta la contraseña', async () => {
    const fixture = setup(createServiceStub());
    await settle(fixture);
    const input = el<HTMLInputElement>(fixture, '#new-password-value');

    el<HTMLButtonElement>(fixture, '.auth-form__toggle-visibility').click();
    fixture.detectChanges();

    expect(input.type).toBe('text');
  });
});
