import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router, UrlTree, provideRouter } from '@angular/router';
import { authGuard } from './guards/auth.guard';
import { authInterceptor } from './interceptors/auth.interceptor';
import { errorInterceptor } from './interceptors/error.interceptor';
import { AuthService } from '../auth/application/auth.service';
import { SUPABASE_CLIENT } from './supabase/supabase.client';

describe('authGuard', () => {
  function run(user: object | null) {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: { authReady: Promise.resolve(), currentUser: signal(user) } },
      ],
    });
    return TestBed.runInInjectionContext(() => authGuard({} as never, {} as never)) as Promise<boolean | UrlTree>;
  }

  it('deja pasar a un usuario con sesión', async () => {
    await expect(run({ uid: 'auth-1' })).resolves.toBe(true);
  });

  it('sin sesión redirige al login', async () => {
    const result = await run(null);

    expect(TestBed.inject(Router).serializeUrl(result as UrlTree)).toBe('/auth/login');
  });
});

describe('interceptores HTTP', () => {
  let http: HttpClient;
  let backend: HttpTestingController;
  let getSession: ReturnType<typeof vi.fn>;
  let navigate: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    getSession = vi.fn().mockResolvedValue({ data: { session: { access_token: 'jwt-123' } } });
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(withInterceptors([authInterceptor, errorInterceptor])),
        provideHttpClientTesting(),
        { provide: SUPABASE_CLIENT, useValue: { auth: { getSession } } },
      ],
    });
    http = TestBed.inject(HttpClient);
    backend = TestBed.inject(HttpTestingController);
    navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
  });

  afterEach(() => backend.verify());

  async function request(url: string) {
    const result = new Promise<unknown>((resolve) => http.get(url).subscribe({ next: resolve, error: resolve }));
    await Promise.resolve();
    await Promise.resolve();
    return { req: backend.expectOne(url), result };
  }

  it('manda el token de Supabase solo a nuestro backend', async () => {
    const { req } = await request('http://localhost:2999/patients');

    expect(req.request.headers.get('Authorization')).toBe('Bearer jwt-123');
    req.flush([]);
  });

  it('sin sesión manda el request sin token', async () => {
    getSession.mockResolvedValue({ data: { session: null } });
    const { req } = await request('http://localhost:2999/patients');

    expect(req.request.headers.has('Authorization')).toBe(false);
    req.flush([]);
  });

  it('a otros dominios no les manda el token (ni consulta la sesión)', () => {
    http.get('https://api.externa.com/datos').subscribe();
    const req = backend.expectOne('https://api.externa.com/datos');

    expect(req.request.headers.has('Authorization')).toBe(false);
    expect(getSession).not.toHaveBeenCalled();
    req.flush({});
  });

  it('un 401 lleva al login y propaga el error', async () => {
    const { req, result } = await request('http://localhost:2999/patients');

    req.flush({}, { status: 401, statusText: 'Unauthorized' });

    expect(navigate).toHaveBeenCalledWith(['/auth/login']);
    expect(await result).toMatchObject({ status: 401 });
  });

  it('otros errores solo se propagan', async () => {
    const { req, result } = await request('http://localhost:2999/patients');

    req.flush({}, { status: 500, statusText: 'Error' });

    expect(navigate).not.toHaveBeenCalled();
    expect(await result).toMatchObject({ status: 500 });
  });
});
