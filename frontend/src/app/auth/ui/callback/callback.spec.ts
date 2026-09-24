import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { CallbackComponent } from './callback';
import { AuthService } from '../../application/auth.service';

async function setup(query: Record<string, string>, user: object | null) {
  TestBed.configureTestingModule({
    imports: [CallbackComponent],
    providers: [
      provideRouter([]),
      { provide: AuthService, useValue: { authReady: Promise.resolve(), currentUser: signal(user) } },
      { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap(query) } } },
    ],
  });
  const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
  const fixture = TestBed.createComponent(CallbackComponent);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return { root: fixture.nativeElement as HTMLElement, navigate };
}

describe('CallbackComponent (vuelta del login con Google)', () => {
  it('con sesión lleva al panel, reemplazando la URL del callback', async () => {
    const { navigate } = await setup({}, { uid: 'auth-1' });

    expect(navigate).toHaveBeenCalledWith('/dashboard', { replaceUrl: true });
  });

  it('sin sesión vuelve al login', async () => {
    const { navigate } = await setup({}, null);

    expect(navigate).toHaveBeenCalledWith('/auth/login', { replaceUrl: true });
  });

  it.each<Record<string, string>>([{ error: 'access_denied' }, { error_description: 'Cancelado' }])(
    'si Google devolvió un error (%o), lo muestra y no navega',
    async (query) => {
      const { root, navigate } = await setup(query, null);

      expect(root.textContent).toContain('No se pudo iniciar sesión con Google');
      expect(navigate).not.toHaveBeenCalled();
    },
  );
});
