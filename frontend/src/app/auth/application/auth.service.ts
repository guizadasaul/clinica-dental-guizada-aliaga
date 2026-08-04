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

  constructor() {
    this.authReady = new Promise<void>((resolve) => {
      this.resolveReady = resolve;
    });

    // Callback intencionalmente NO async: onAuthStateChange awaitea este
    // callback dentro de un lock de auth-js. Cualquier llamada async a
    // supabase.auth.* desde acá (incluida vía el interceptor) genera un
    // await circular que cuelga la app sin ningún error en consola.
    this.supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        this.currentUser.set(null);
        this.syncedUserId = null;
        this.settleReady();
        return;
      }

      if (this.syncedUserId === session.user.id) {
        // Mismo usuario ya sincronizado (TOKEN_REFRESHED, o el interceptor
        // reemitiendo el estado vía getSession() en cada request HTTP): no
        // pisar currentUser con un reset a role:null.
        this.settleReady();
        return;
      }

      this.currentUser.set(toAuthenticatedUser(session.user));
      this.syncedUserId = session.user.id;
      setTimeout(() => {
        void this.syncWithBackend().finally(() => this.settleReady());
      }, 0);
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

  async registerWithPassword(email: string, password: string): Promise<{ confirmationRequired: boolean }> {
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

  async logout(): Promise<void> {
    await this.supabase.auth.signOut();
    this.currentUser.set(null);
  }

  private async syncWithBackend(): Promise<void> {
    try {
      const user = await firstValueFrom(
        this.http.post<BackendUser>(`${environment.backendUrl}/auth/sync`, {}),
      );
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
    } catch {
      // role queda null — el guard igual deja pasar por sesión válida
    }
  }

  private settleReady(): void {
    if (!this.settled) {
      this.settled = true;
      this.resolveReady();
    }
  }
}
