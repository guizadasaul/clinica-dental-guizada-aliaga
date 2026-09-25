import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, of, tap, throwError } from 'rxjs';
import { AuthService } from '../../../auth/application/auth.service';
import { environment } from '../../../../environments/environment';
import type {
  ChatLink,
  ChatMessageResponse,
  PublicChatMessageResponse,
} from '../models/chat.model';
import type {
  ChatLocale,
  ChatMessageRequest,
  PublicChatMessageRequest,
} from '../models/chat.request';

/** Conversación del usuario logueado: se guarda con su uid para no retomarla con otra cuenta. */
export const USER_SESSION_KEY = 'cga-chat-user-session';
/** Token opaco de la conversación anónima (lo emite el backend). */
export const GUEST_TOKEN_KEY = 'cga-chat-guest-token';

export interface ChatbotReply {
  reply: string;
  links: ChatLink[];
}

interface StoredUserSession {
  uid: string;
  sessionId: string;
}

/**
 * localStorage puede lanzar (modo privado, cuota, almacenamiento bloqueado).
 * Si falla, la conversación sigue en memoria mientras dure la página.
 */
class SafeStorage {
  private readonly memory = new Map<string, string>();

  get(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return this.memory.get(key) ?? null;
    }
  }

  set(key: string, value: string): void {
    this.memory.set(key, value);
    try {
      localStorage.setItem(key, value);
    } catch {
      // Queda solo en memoria.
    }
  }

  remove(key: string): void {
    this.memory.delete(key);
    try {
      localStorage.removeItem(key);
    } catch {
      // Nada que borrar fuera de memoria.
    }
  }
}

/**
 * Cliente del chatbot (CLI-97). Con sesión de Supabase usa el endpoint
 * autenticado (el interceptor pone el token); sin sesión, el público. Las
 * conversaciones de cada modo no se mezclan: al usar uno se descarta la
 * referencia guardada del otro.
 */
@Injectable({ providedIn: 'root' })
export class ChatbotService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly storage = new SafeStorage();
  private readonly baseUrl = environment.backendUrl;

  send(message: string, locale?: ChatLocale): Observable<ChatbotReply> {
    const uid = this.auth.currentUser()?.uid;
    return uid ? this.sendAsUser(uid, message, locale) : this.sendAsGuest(message, locale);
  }

  /** Borra la conversación: en el backend si hay sesión, y siempre la referencia local. */
  clear(): Observable<void> {
    const uid = this.auth.currentUser()?.uid;
    if (!uid) {
      this.storage.remove(GUEST_TOKEN_KEY);
      return of(undefined);
    }
    return this.http
      .delete<void>(`${this.baseUrl}/chat/sessions`)
      .pipe(tap(() => this.storage.remove(USER_SESSION_KEY)));
  }

  private sendAsUser(
    uid: string,
    message: string,
    locale: ChatLocale | undefined,
  ): Observable<ChatbotReply> {
    this.storage.remove(GUEST_TOKEN_KEY);
    const sessionId = this.readUserSession(uid);
    const body: ChatMessageRequest = {
      message,
      ...(sessionId && { sessionId }),
      ...(locale && { locale }),
    };
    return this.http.post<ChatMessageResponse>(`${this.baseUrl}/chat/messages`, body).pipe(
      tap((res) => {
        const stored: StoredUserSession = { uid, sessionId: res.sessionId };
        this.storage.set(USER_SESSION_KEY, JSON.stringify(stored));
      }),
      map(({ reply, links }) => ({ reply, links })),
      catchError((error: unknown) => {
        // La conversación ya no existe (retención de 30 días o borrada desde
        // otro dispositivo): se empieza una nueva, una sola vez.
        if (sessionId && error instanceof HttpErrorResponse && error.status === 404) {
          this.storage.remove(USER_SESSION_KEY);
          return this.sendAsUser(uid, message, locale);
        }
        return throwError(() => error);
      }),
    );
  }

  private sendAsGuest(message: string, locale: ChatLocale | undefined): Observable<ChatbotReply> {
    this.storage.remove(USER_SESSION_KEY);
    const sessionToken = this.storage.get(GUEST_TOKEN_KEY);
    const body: PublicChatMessageRequest = {
      message,
      ...(sessionToken && { sessionToken }),
      ...(locale && { locale }),
    };
    return this.http
      .post<PublicChatMessageResponse>(`${this.baseUrl}/public/chat/messages`, body)
      .pipe(
        tap((res) => this.storage.set(GUEST_TOKEN_KEY, res.sessionToken)),
        map(({ reply, links }) => ({ reply, links })),
      );
  }

  private readUserSession(uid: string): string | null {
    const raw = this.storage.get(USER_SESSION_KEY);
    if (!raw) return null;
    try {
      const stored = JSON.parse(raw) as Partial<StoredUserSession>;
      return stored.uid === uid && typeof stored.sessionId === 'string' ? stored.sessionId : null;
    } catch {
      return null;
    }
  }
}
