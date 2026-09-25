import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../../auth/application/auth.service';
import type { AuthenticatedUser } from '../../../auth/models/authenticated-user.model';
import { ChatbotService, GUEST_TOKEN_KEY, USER_SESSION_KEY } from './chatbot.service';

const API = 'http://localhost:2999';
const PATIENT: AuthenticatedUser = {
  uid: 'uid-1',
  id: 'user-1',
  email: 'ana@test.com',
  displayName: 'Ana',
  photoURL: null,
  role: 'patient',
};

function setup(user: AuthenticatedUser | null = null) {
  const currentUser = signal<AuthenticatedUser | null>(user);
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: AuthService, useValue: { currentUser } },
    ],
  });
  return {
    service: TestBed.inject(ChatbotService),
    http: TestBed.inject(HttpTestingController),
    currentUser,
  };
}

describe('ChatbotService', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => {
    TestBed.inject(HttpTestingController).verify();
    vi.restoreAllMocks();
  });

  describe('visitante sin sesión', () => {
    it('usa el endpoint público, guarda el token y lo reusa', async () => {
      const { service, http } = setup();

      const first = firstValueFrom(service.send('Hola', 'es'));
      const req1 = http.expectOne(`${API}/public/chat/messages`);
      expect(req1.request.method).toBe('POST');
      expect(req1.request.body).toEqual({ message: 'Hola', locale: 'es' });
      req1.flush({ sessionToken: 'tok-123456789012345678901', reply: 'Hola!', links: [] });
      await expect(first).resolves.toEqual({ reply: 'Hola!', links: [] });
      expect(localStorage.getItem(GUEST_TOKEN_KEY)).toBe('tok-123456789012345678901');

      const second = firstValueFrom(service.send('¿Horario?'));
      const req2 = http.expectOne(`${API}/public/chat/messages`);
      expect(req2.request.body).toEqual({
        message: '¿Horario?',
        sessionToken: 'tok-123456789012345678901',
      });
      req2.flush({ sessionToken: 'tok-123456789012345678901', reply: 'De 9 a 19', links: [] });
      await second;
    });

    it('descarta la conversación guardada de un usuario logueado', async () => {
      localStorage.setItem(USER_SESSION_KEY, JSON.stringify({ uid: 'uid-1', sessionId: 's-1' }));
      const { service, http } = setup();

      const reply = firstValueFrom(service.send('Hola'));
      http
        .expectOne(`${API}/public/chat/messages`)
        .flush({ sessionToken: 'tok', reply: 'ok', links: [] });
      await reply;

      expect(localStorage.getItem(USER_SESSION_KEY)).toBeNull();
    });

    it('clear() solo borra el token local, sin llamar al backend', async () => {
      localStorage.setItem(GUEST_TOKEN_KEY, 'tok');
      const { service, http } = setup();

      await firstValueFrom(service.clear());

      expect(localStorage.getItem(GUEST_TOKEN_KEY)).toBeNull();
      http.expectNone(`${API}/chat/sessions`);
    });
  });

  describe('usuario logueado', () => {
    it('usa el endpoint autenticado, guarda el sessionId con su uid y lo reusa', async () => {
      localStorage.setItem(GUEST_TOKEN_KEY, 'tok-anonimo');
      const { service, http } = setup(PATIENT);

      const first = firstValueFrom(service.send('¿Mi próxima cita?', 'es'));
      const req1 = http.expectOne(`${API}/chat/messages`);
      expect(req1.request.body).toEqual({ message: '¿Mi próxima cita?', locale: 'es' });
      req1.flush({
        sessionId: 's-1',
        reply: 'El lunes',
        links: [{ label: 'Reservar', url: 'http://localhost:4200/reservar' }],
      });
      await expect(first).resolves.toEqual({
        reply: 'El lunes',
        links: [{ label: 'Reservar', url: 'http://localhost:4200/reservar' }],
      });
      expect(localStorage.getItem(GUEST_TOKEN_KEY)).toBeNull();
      expect(JSON.parse(localStorage.getItem(USER_SESSION_KEY)!)).toEqual({
        uid: 'uid-1',
        sessionId: 's-1',
      });

      const second = firstValueFrom(service.send('¿Y mi saldo?'));
      const req2 = http.expectOne(`${API}/chat/messages`);
      expect(req2.request.body).toEqual({ message: '¿Y mi saldo?', sessionId: 's-1' });
      req2.flush({ sessionId: 's-1', reply: '300 Bs.', links: [] });
      await second;
    });

    it('no retoma la conversación guardada de otra cuenta', async () => {
      localStorage.setItem(USER_SESSION_KEY, JSON.stringify({ uid: 'otra', sessionId: 's-9' }));
      const { service, http } = setup(PATIENT);

      const reply = firstValueFrom(service.send('Hola'));
      const req = http.expectOne(`${API}/chat/messages`);
      expect(req.request.body).toEqual({ message: 'Hola' });
      req.flush({ sessionId: 's-2', reply: 'ok', links: [] });
      await reply;
    });

    it('ignora un valor guardado que no es JSON', async () => {
      localStorage.setItem(USER_SESSION_KEY, '{roto');
      const { service, http } = setup(PATIENT);

      const reply = firstValueFrom(service.send('Hola'));
      const req = http.expectOne(`${API}/chat/messages`);
      expect(req.request.body).toEqual({ message: 'Hola' });
      req.flush({ sessionId: 's-2', reply: 'ok', links: [] });
      await reply;
    });

    it('si la conversación ya no existe (404) empieza una nueva una sola vez', async () => {
      localStorage.setItem(USER_SESSION_KEY, JSON.stringify({ uid: 'uid-1', sessionId: 'vieja' }));
      const { service, http } = setup(PATIENT);

      const reply = firstValueFrom(service.send('Hola'));
      http
        .expectOne((r) => r.body?.sessionId === 'vieja')
        .flush({ message: 'Conversación no encontrada' }, { status: 404, statusText: 'Not Found' });
      const retry = http.expectOne(`${API}/chat/messages`);
      expect(retry.request.body).toEqual({ message: 'Hola' });
      retry.flush({ sessionId: 'nueva', reply: 'ok', links: [] });

      await expect(reply).resolves.toEqual({ reply: 'ok', links: [] });
      expect(JSON.parse(localStorage.getItem(USER_SESSION_KEY)!).sessionId).toBe('nueva');
    });

    it('otros errores se propagan sin reintentar', async () => {
      const { service, http } = setup(PATIENT);

      const reply = firstValueFrom(service.send('Hola'));
      http
        .expectOne(`${API}/chat/messages`)
        .flush({}, { status: 429, statusText: 'Too Many Requests' });

      await expect(reply).rejects.toMatchObject({ status: 429 });
    });

    it('un 404 sin conversación guardada no reintenta', async () => {
      const { service, http } = setup(PATIENT);

      const reply = firstValueFrom(service.send('Hola'));
      http.expectOne(`${API}/chat/messages`).flush({}, { status: 404, statusText: 'Not Found' });

      await expect(reply).rejects.toMatchObject({ status: 404 });
    });

    it('clear() borra sus conversaciones en el backend y la referencia local', async () => {
      localStorage.setItem(USER_SESSION_KEY, JSON.stringify({ uid: 'uid-1', sessionId: 's-1' }));
      const { service, http } = setup(PATIENT);

      const cleared = firstValueFrom(service.clear());
      const req = http.expectOne(`${API}/chat/sessions`);
      expect(req.request.method).toBe('DELETE');
      req.flush(null, { status: 204, statusText: 'No Content' });
      await cleared;

      expect(localStorage.getItem(USER_SESSION_KEY)).toBeNull();
    });
  });

  it('si localStorage falla, la conversación sigue en memoria', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    const { service, http } = setup();

    const first = firstValueFrom(service.send('Hola'));
    http
      .expectOne(`${API}/public/chat/messages`)
      .flush({ sessionToken: 'tok-memoria', reply: 'ok', links: [] });
    await first;

    const second = firstValueFrom(service.send('Otra'));
    const req = http.expectOne(`${API}/public/chat/messages`);
    expect(req.request.body).toEqual({ message: 'Otra', sessionToken: 'tok-memoria' });
    req.flush({ sessionToken: 'tok-memoria', reply: 'ok', links: [] });
    await second;

    await firstValueFrom(service.clear());
    const third = firstValueFrom(service.send('Última'));
    const last = http.expectOne(`${API}/public/chat/messages`);
    expect(last.request.body).toEqual({ message: 'Última' });
    last.flush({ sessionToken: 'tok-nuevo', reply: 'ok', links: [] });
    await third;
  });
});
