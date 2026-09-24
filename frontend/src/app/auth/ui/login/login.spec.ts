import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { LoginComponent } from './login';
import { AuthService } from '../../application/auth.service';

function setup(query: Record<string, string> = {}) {
  const auth = {
    loginWithPassword: vi.fn().mockResolvedValue(undefined),
    loginWithPhone: vi.fn().mockResolvedValue(undefined),
    loginWithGoogle: vi.fn().mockResolvedValue(undefined),
    waitForSync: vi.fn().mockResolvedValue(undefined),
  };
  TestBed.configureTestingModule({
    imports: [LoginComponent],
    providers: [
      provideRouter([]),
      provideTranslateService({ defaultLanguage: 'es' }),
      { provide: AuthService, useValue: auth },
      {
        provide: ActivatedRoute,
        useValue: { snapshot: { queryParamMap: convertToParamMap(query) } },
      },
    ],
  });
  const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
  const fixture = TestBed.createComponent(LoginComponent);
  fixture.detectChanges();
  const root = fixture.nativeElement as HTMLElement;
  return { fixture, root, auth, navigate };
}

function type(root: HTMLElement, id: string, value: string): void {
  const el = root.querySelector<HTMLInputElement>(`#${id}`)!;
  el.value = value;
  el.dispatchEvent(new Event('input'));
}

async function submit(fixture: ReturnType<typeof setup>['fixture']): Promise<void> {
  (fixture.nativeElement as HTMLElement).querySelector('form')!.dispatchEvent(new Event('submit'));
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
}

// Sin archivos de traducción cargados, `instant` devuelve la clave: alcanza para saber qué mensaje se eligió.
describe('LoginComponent', () => {
  it('después de restablecer la contraseña muestra el aviso de éxito', () => {
    const { root } = setup({ reset: 'success' });

    expect(root.querySelector('.login-card__success')?.textContent).toContain(
      'auth.login.resetSuccess',
    );
    expect(root.querySelector('.login-card__success')?.getAttribute('aria-live')).toBe('polite');
  });

  it('pide completar usuario y contraseña', async () => {
    const { fixture, root, auth } = setup();

    await submit(fixture);

    expect(root.textContent).toContain('auth.login.errors.required');
    expect(auth.loginWithPassword).not.toHaveBeenCalled();
  });

  it.each(['no-es-email@', '12'])(
    'rechaza un usuario con formato inválido (%s) sin llamar a Supabase',
    async (id) => {
      const { fixture, root, auth } = setup();
      type(root, 'login-identifier', id);
      type(root, 'login-password', 'clave');

      await submit(fixture);

      expect(root.textContent).toContain('auth.login.errors.invalidIdentifier');
      expect(auth.loginWithPassword).not.toHaveBeenCalled();
      expect(auth.loginWithPhone).not.toHaveBeenCalled();
    },
  );

  it('con email entra por email y espera la sincronización antes de ir al panel', async () => {
    const { fixture, root, auth, navigate } = setup();
    type(root, 'login-identifier', '  ana@example.com ');
    type(root, 'login-password', 'secreta');

    await submit(fixture);

    expect(auth.loginWithPassword).toHaveBeenCalledWith('ana@example.com', 'secreta');
    expect(auth.waitForSync).toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith('/dashboard');
  });

  it('con teléfono entra por teléfono, normalizado a E.164', async () => {
    const { fixture, root, auth } = setup();
    type(root, 'login-identifier', '+591 70000000');
    type(root, 'login-password', 'secreta');

    await submit(fixture);

    expect(auth.loginWithPhone).toHaveBeenCalledWith('+59170000000', 'secreta');
  });

  it('si Supabase rechaza, muestra su mensaje y vuelve a habilitar el formulario', async () => {
    const { fixture, root, auth, navigate } = setup();
    auth.loginWithPassword.mockRejectedValue(new Error('Credenciales inválidas'));
    type(root, 'login-identifier', 'ana@example.com');
    type(root, 'login-password', 'mala');

    await submit(fixture);

    expect(root.textContent).toContain('Credenciales inválidas');
    expect(navigate).not.toHaveBeenCalled();
    expect((fixture.componentInstance as unknown as { loading(): boolean }).loading()).toBe(false);
  });

  it('un error sin mensaje muestra el genérico', async () => {
    const { fixture, root, auth } = setup();
    auth.loginWithPassword.mockRejectedValue('boom');
    type(root, 'login-identifier', 'ana@example.com');
    type(root, 'login-password', 'mala');

    await submit(fixture);

    expect(root.textContent).toContain('auth.login.errors.generic');
  });

  it('mientras carga, un segundo envío no hace nada', async () => {
    const { fixture, root, auth } = setup();
    let finish: () => void = () => undefined;
    auth.loginWithPassword.mockReturnValue(new Promise<void>((resolve) => (finish = resolve)));
    type(root, 'login-identifier', 'ana@example.com');
    type(root, 'login-password', 'secreta');

    root.querySelector('form')!.dispatchEvent(new Event('submit'));
    root.querySelector('form')!.dispatchEvent(new Event('submit'));
    root.querySelector<HTMLButtonElement>('.auth-form__google-btn')!.click();
    finish();
    await fixture.whenStable();

    expect(auth.loginWithPassword).toHaveBeenCalledTimes(1);
    expect(auth.loginWithGoogle).not.toHaveBeenCalled();
  });

  it('el ojito muestra y oculta la contraseña', () => {
    const { fixture, root } = setup();
    const password = () => root.querySelector<HTMLInputElement>('#login-password')!;

    expect(password().type).toBe('password');
    root.querySelector<HTMLButtonElement>('.auth-form__toggle-visibility')!.click();
    fixture.detectChanges();
    expect(password().type).toBe('text');
  });

  describe('Google', () => {
    function googleButton(root: HTMLElement): HTMLButtonElement {
      return root.querySelector<HTMLButtonElement>('.auth-form__google-btn')!;
    }

    it('inicia el login con Google y queda cargando mientras redirige', async () => {
      const { fixture, root, auth } = setup();

      googleButton(root).click();
      await fixture.whenStable();

      expect(auth.loginWithGoogle).toHaveBeenCalled();
      expect((fixture.componentInstance as unknown as { loading(): boolean }).loading()).toBe(true);
    });

    it('si falla, avisa y libera el botón', async () => {
      const { fixture, root, auth } = setup();
      auth.loginWithGoogle.mockRejectedValue(new Error('popup'));

      googleButton(root).click();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(root.textContent).toContain('auth.login.errors.googleFailed');
      expect((fixture.componentInstance as unknown as { loading(): boolean }).loading()).toBe(
        false,
      );
    });
  });
});
