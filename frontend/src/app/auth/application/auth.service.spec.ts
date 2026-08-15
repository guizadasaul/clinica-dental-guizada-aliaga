import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { AuthService } from './auth.service';
import { SUPABASE_CLIENT } from '../../core/supabase/supabase.client';

type AuthChangeCallback = (event: string, session: { user: { id: string } } | null) => void;

interface FakeSession {
  user: { id: string };
}

function createFakeSupabaseClient() {
  let callback: AuthChangeCallback = () => {};
  return {
    client: {
      auth: {
        onAuthStateChange: (cb: AuthChangeCallback) => {
          callback = cb;
          return { data: { subscription: { unsubscribe: () => {} } } };
        },
      },
    },
    fireEvent: (event: string, session: FakeSession | null) => callback(event, session),
  };
}

const BACKEND_USER = {
  id: 'u-1',
  authUserId: 'user-1',
  email: 'sistemaamigos9@gmail.com',
  role: 'odontologist' as const,
  displayName: 'Sistema Amigos',
  phone: null,
  photoUrl: null,
  isActive: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('AuthService', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  function setup() {
    const fakeSupabase = createFakeSupabaseClient();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: SUPABASE_CLIENT, useValue: fakeSupabase.client },
      ],
    });
    const service = TestBed.inject(AuthService);
    const httpMock = TestBed.inject(HttpTestingController);
    return { service, httpMock, fakeSupabase };
  }

  it('waits for the in-flight sync before resolving authReady, even when Supabase fires duplicate auth events for the same login', async () => {
    // Reproduce lo visto en producción (CLI-23): Supabase dispara varios
    // eventos (SIGNED_IN, INITIAL_SESSION, SIGNED_IN) para un mismo login,
    // separados por microtareas — no uno solo. El segundo evento ve
    // syncedUserId ya seteado por el primero (síncronamente) y, sin el fix,
    // resolvía authReady de una sin esperar a que /auth/sync siquiera
    // arrancara, dejando currentUser().role en null para cualquier guard que
    // corriera justo después.
    vi.useFakeTimers();
    const { service, httpMock, fakeSupabase } = setup();
    const session: FakeSession = { user: { id: 'user-1' } };

    fakeSupabase.fireEvent('SIGNED_IN', session);
    fakeSupabase.fireEvent('INITIAL_SESSION', session);
    fakeSupabase.fireEvent('SIGNED_IN', session);

    let ready = false;
    void service.authReady.then(() => {
      ready = true;
    });

    // Deja correr el setTimeout(0) que dispara syncWithBackend, pero el
    // POST /auth/sync todavía no respondió.
    await vi.advanceTimersByTimeAsync(0);
    expect(ready).toBe(false);
    expect(service.currentUser()?.role).toBeNull();

    const req = httpMock.expectOne((r) => r.url.endsWith('/auth/sync'));
    req.flush(BACKEND_USER);
    await vi.advanceTimersByTimeAsync(0);

    expect(ready).toBe(true);
    expect(service.currentUser()?.role).toBe('odontologist');

    httpMock.verify();
  });

  it('does not re-fire /auth/sync for a duplicate event of a user already fully synced', async () => {
    vi.useFakeTimers();
    const { service, httpMock, fakeSupabase } = setup();
    const session: FakeSession = { user: { id: 'user-1' } };

    fakeSupabase.fireEvent('SIGNED_IN', session);
    await vi.advanceTimersByTimeAsync(0);
    httpMock.expectOne((r) => r.url.endsWith('/auth/sync')).flush(BACKEND_USER);
    await vi.advanceTimersByTimeAsync(0);
    await service.authReady;

    expect(service.currentUser()?.role).toBe('odontologist');

    // Un evento tardío (ej. TOKEN_REFRESHED) para el mismo usuario no debe
    // pisar el role ya sincronizado ni disparar un segundo /auth/sync.
    fakeSupabase.fireEvent('TOKEN_REFRESHED', session);
    await vi.advanceTimersByTimeAsync(0);

    expect(service.currentUser()?.role).toBe('odontologist');
    httpMock.verify();
  });

  it('waitForSync waits for a fresh login even after authReady already resolved at app boot', async () => {
    // authReady resuelve UNA vez, al arrancar la app — para una pantalla que
    // ya estaba abierta (login/registro/invitación) y recién ahora dispara
    // un login, authReady ya está resuelta desde hace rato y awaitearla no
    // espera nada. Un código que navega a una ruta gateada por ficha justo
    // después de loguearse necesita esperar el sync de ESTE login puntual —
    // para eso existe waitForSync, no authReady.
    vi.useFakeTimers();
    const { service, httpMock, fakeSupabase } = setup();

    // Arranque de la app sin sesión: authReady resuelve casi de inmediato.
    fakeSupabase.fireEvent('INITIAL_SESSION', null);
    await service.authReady;

    // Recién ahora el usuario se loguea, dentro de la misma app ya corriendo.
    fakeSupabase.fireEvent('SIGNED_IN', { user: { id: 'user-2' } });

    let syncSettled = false;
    void service.waitForSync().then(() => {
      syncSettled = true;
    });

    await vi.advanceTimersByTimeAsync(0);
    expect(syncSettled).toBe(false);
    expect(service.currentUser()?.role).toBeNull();

    httpMock.expectOne((r) => r.url.endsWith('/auth/sync')).flush(BACKEND_USER);
    await vi.advanceTimersByTimeAsync(0);

    expect(syncSettled).toBe(true);
    expect(service.currentUser()?.role).toBe('odontologist');
    httpMock.verify();
  });
});
