import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { AuthService } from '../../application/auth.service';
import { ConfirmEmailComponent } from './confirm-email';

function setup(tokenHash: string | null, loggedInAfterSync = true) {
  const currentUser = signal<{ uid: string } | null>(null);
  const auth = {
    authReady: Promise.resolve(),
    currentUser,
    confirmEmail: vi.fn().mockImplementation(() => {
      if (loggedInAfterSync) currentUser.set({ uid: 'uid-1' });
      return Promise.resolve();
    }),
    waitForSync: vi.fn().mockResolvedValue(undefined),
    resendEmailConfirmation: vi.fn().mockResolvedValue(undefined),
  };
  TestBed.configureTestingModule({
    imports: [ConfirmEmailComponent],
    providers: [
      provideRouter([]),
      { provide: AuthService, useValue: auth },
      {
        provide: ActivatedRoute,
        useValue: {
          snapshot: {
            queryParamMap: convertToParamMap(tokenHash ? { token_hash: tokenHash, type: 'signup' } : {}),
          },
        },
      },
    ],
  });
  const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
  const fixture = TestBed.createComponent(ConfirmEmailComponent);
  fixture.detectChanges();
  const render = async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
    await fixture.whenStable();
    fixture.detectChanges();
  };
  const root = fixture.nativeElement as HTMLElement;
  return { auth, navigate, render, root };
}

describe('ConfirmEmailComponent (CLI-242)', () => {
  it('confirma con el token_hash del link y entra al portal', async () => {
    const { auth, navigate, render } = setup('hash-1');
    await render();

    expect(auth.confirmEmail).toHaveBeenCalledWith('hash-1');
    expect(auth.waitForSync).toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith('/dashboard', { replaceUrl: true });
  });

  it('si confirma pero el sync no deja sesión, avisa que ya puede iniciar sesión', async () => {
    const { navigate, render, root } = setup('hash-1', false);
    await render();

    expect(navigate).not.toHaveBeenCalled();
    expect(root.textContent).toContain('Tu correo quedó confirmado');
  });

  it('sin token no intenta confirmar y explica que el enlace no es válido', async () => {
    const { auth, render, root } = setup(null);
    await render();

    expect(auth.confirmEmail).not.toHaveBeenCalled();
    expect(root.textContent).toContain('no es válido');
  });

  it('con un link vencido o usado ofrece mandar uno nuevo, con el mismo aviso exista o no la cuenta', async () => {
    const { auth, render, root } = setup('hash-viejo');
    auth.confirmEmail.mockRejectedValue(new Error('El enlace de confirmación venció o ya se usó.'));
    await render();
    expect(root.textContent).toContain('venció o ya se usó');

    const input = root.querySelector<HTMLInputElement>('#confirm-email')!;
    input.value = ' Carla@Example.com ';
    input.dispatchEvent(new Event('input'));
    root.querySelector<HTMLFormElement>('.auth-form')!.dispatchEvent(new Event('submit'));
    await render();

    expect(auth.resendEmailConfirmation).toHaveBeenCalledWith('carla@example.com');
    expect(root.textContent).toContain('te enviamos un enlace nuevo');
  });

  it('no manda nada con un correo inválido', async () => {
    const { auth, render, root } = setup('hash-viejo');
    auth.confirmEmail.mockRejectedValue(new Error('x'));
    await render();

    const input = root.querySelector<HTMLInputElement>('#confirm-email')!;
    input.value = 'no-es-correo';
    input.dispatchEvent(new Event('input'));
    root.querySelector<HTMLFormElement>('.auth-form')!.dispatchEvent(new Event('submit'));
    await render();

    expect(auth.resendEmailConfirmation).not.toHaveBeenCalled();
    expect(root.textContent).toContain('Ingresa un correo válido.');
  });
});
