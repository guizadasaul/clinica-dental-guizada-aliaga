import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import type { User as SupabaseUser } from '@supabase/supabase-js';
import { SUPABASE_CLIENT } from '../../core/supabase/supabase.client';
import { environment } from '../../../environments/environment';
import type { AuthenticatedUser } from '../models/authenticated-user.model';
import type { BackendUser } from '../models/backend-user.model';
import { mapAuthError } from './auth-error.util';

function toAuthenticatedUser(user: SupabaseUser): AuthenticatedUser {
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  return {
    uid: user.id,
    email: user.email ?? null,
    displayName: (meta['name'] ?? meta['full_name'] ?? null) as string | null,
    photoURL: (meta['picture'] ?? meta['avatar_url'] ?? null) as string | null,
    role: null,
  };
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly supabase = inject(SUPABASE_CLIENT);
  private readonly http = inject(HttpClient);

  readonly currentUser = signal<AuthenticatedUser | null>(null);

  /**
   * Se resuelve cuando Supabase termina de restaurar (o descartar) la sesión
   * persistida al arrancar la app. El guard debe esperar esta promesa antes de
   * decidir, para no redirigir a login por la condición de carrera del reload.
   */
  readonly authReady: Promise<void>;

  private settled = false;
  private resolveReady!: () => void;
  private syncedUserId: string | null = null;
  // Promesa del sync en curso (o recién terminado) para syncedUserId. Supabase
  // dispara varios eventos (ej. SIGNED_IN + INITIAL_SESSION + SIGNED_IN) para
  // un mismo login, separados por apenas 1-2ms — el segundo evento ve
  // syncedUserId ya seteado (por el primero, de forma síncrona) y, sin esto,
  // resolvía authReady de una sin esperar a que el sync programado por el
  // primer evento (via setTimeout) siquiera arrancara. El guard terminaba
  // leyendo currentUser().role todavía en null. Ver CLI-23.
  private pendingSync: Promise<void> | null = null;

  constructor() {
    this.authReady = new Promise<void>((resolve) => {
      this.resolveReady = resolve;
    });

    // Callback intencionalmente NO async: onAuthStateChange awaitea este
    // callback dentro de un lock de auth-js. Cualquier llamada async a
    // supabase.auth.* desde acá (incluida vía el interceptor) genera un
    // await circular que cuelga la app sin ningún error en consola.
    this.supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        // Sesión de recuperación del link de "olvidé mi contraseña": es una
        // sesión válida a nivel de Supabase, pero NO se trata como login
        // normal — si seteáramos currentUser acá, authGuard dejaría pasar a
        // alguien que todavía no definió su nueva contraseña. La pantalla
        // reset-password valida esta sesión por su cuenta.
        this.settleReady();
        return;
      }

      if (!session) {
        this.currentUser.set(null);
        this.syncedUserId = null;
        this.pendingSync = null;
        this.settleReady();
        return;
      }

      if (this.syncedUserId === session.user.id) {
        // Mismo usuario ya sincronizado o en proceso (TOKEN_REFRESHED, un
        // evento duplicado del propio login, o el interceptor reemitiendo el
        // estado vía getSession() en cada request HTTP): no pisar currentUser
        // con un reset a role:null. Si todavía hay un sync en vuelo, esperarlo
        // antes de resolver authReady en vez de resolverla de una.
        if (this.pendingSync) {
          void this.pendingSync.then(() => this.settleReady());
        } else {
          this.settleReady();
        }
        return;
      }

      this.currentUser.set(toAuthenticatedUser(session.user));
      this.syncedUserId = session.user.id;
      this.pendingSync = new Promise<void>((resolve) => {
        setTimeout(() => {
          void this.syncWithBackend().finally(resolve);
        }, 0);
      });
      void this.pendingSync.then(() => this.settleReady());
    });
  }

  async loginWithGoogle(): Promise<void> {
    const { error } = await this.supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) {
      throw error;
    }
    // En éxito el browser navega a Google; nada después de esta línea corre.
  }

  async registerWithPassword(
    email: string,
    password: string,
  ): Promise<{ confirmationRequired: boolean }> {
    const { data, error } = await this.supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) {
      throw new Error(mapAuthError(error, 'No se pudo crear la cuenta.'));
    }
    // Con mailer_autoconfirm=false (config actual del proyecto), data.session
    // es null hasta que el usuario confirme por correo.
    return { confirmationRequired: data.session === null };
  }

  async loginWithPassword(email: string, password: string): Promise<void> {
    const { error } = await this.supabase.auth.signInWithPassword({ email, password });
    if (error) {
      throw new Error(mapAuthError(error, 'No se pudo iniciar sesión.'));
    }
    // onAuthStateChange('SIGNED_IN') ya corrió de forma síncrona antes de que
    // signInWithPassword resuelva, así que currentUser() ya está seteado acá.
  }

  async requestPasswordReset(email: string): Promise<void> {
    try {
      await this.supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/reset-password`,
      });
    } catch {
      // Silenciado a propósito: nunca revelar si el correo existe o no.
    }
  }

  async hasRecoverySession(): Promise<boolean> {
    const { data } = await this.supabase.auth.getSession();
    return data.session !== null;
  }

  async updatePassword(newPassword: string): Promise<void> {
    const { error } = await this.supabase.auth.updateUser({ password: newPassword });
    if (error) {
      throw new Error(mapAuthError(error, 'No se pudo actualizar la contraseña.'));
    }
  }

  async logout(): Promise<void> {
    await this.supabase.auth.signOut();
    this.currentUser.set(null);
  }

  private async syncWithBackend(): Promise<void> {
    const inviteToken = sessionStorage.getItem('pendingInviteToken');
    try {
      const user = await firstValueFrom(
        this.http.post<BackendUser>(
          `${environment.backendUrl}/auth/sync`,
          inviteToken ? { inviteToken } : {},
        ),
      );
      this.applyBackendUser(user);
    } catch {
      // El POST falló (blip transitorio, backend reiniciando, etc.) — antes
      // de resignarse a role: null, probar una lectura simple. Si el usuario
      // ya tenía una fila de un sync anterior (ej. un doctor recurrente), esto
      // evita que patientProfileGuard lo expulse a la landing por un error de
      // red puntual en vez de por no tener cuenta de verdad.
      try {
        const user = await firstValueFrom(
          this.http.get<BackendUser>(`${environment.backendUrl}/auth/me`),
        );
        this.applyBackendUser(user);
      } catch {
        // role queda null — usuario genuinamente nuevo sin fila todavía, o el
        // backend sigue caído. El guard de ficha lo manda a la landing.
      }
    } finally {
      if (inviteToken) {
        sessionStorage.removeItem('pendingInviteToken');
      }
    }
  }

  private applyBackendUser(user: BackendUser): void {
    this.currentUser.update((u) =>
      u
        ? {
            ...u,
            role: user.role,
            photoURL: user.photoUrl ?? u.photoURL,
            displayName: user.displayName ?? u.displayName,
            email: user.email ?? u.email,
          }
        : null,
    );
  }

  private settleReady(): void {
    if (!this.settled) {
      this.settled = true;
      this.resolveReady();
    }
  }
}
