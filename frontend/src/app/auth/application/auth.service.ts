import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  signInWithPopup,
  signInWithCustomToken,
  GoogleAuthProvider,
  signOut,
  onAuthStateChanged,
} from 'firebase/auth';
import { environment } from '../../../environments/environment';
import type { AuthenticatedUser } from '../models/authenticated-user.model';
import type { BackendUser } from '../models/backend-user.model';
import type { PhoneAuthResponse } from '../../features/auth/models/phone-auth.model';
import type { RegisterPhoneRequest, LoginPhoneRequest } from '../../features/auth/models/phone-auth.request';

const firebaseApp = getApps().length === 0 ? initializeApp(environment.firebaseConfig) : getApp();
const firebaseAuth = getAuth(firebaseApp);

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);

  readonly currentUser = signal<AuthenticatedUser | null>(null);

  /**
   * Se resuelve cuando Firebase termina de restaurar (o descartar) la sesión
   * persistida al arrancar la app. El guard debe esperar esta promesa antes de
   * decidir, para no redirigir a login por la condición de carrera del reload.
   */
  readonly authReady: Promise<void>;

  constructor() {
    let resolveReady!: () => void;
    this.authReady = new Promise<void>((resolve) => {
      resolveReady = resolve;
    });
    let firstRun = true;

    onAuthStateChanged(firebaseAuth, async (fbUser) => {
      const settleReady = () => {
        if (firstRun) {
          firstRun = false;
          resolveReady();
        }
      };

      if (!fbUser) {
        this.currentUser.set(null);
        settleReady();
        return;
      }

      this.currentUser.set({
        uid: fbUser.uid,
        email: fbUser.email,
        displayName: fbUser.displayName,
        photoURL: fbUser.photoURL,
        role: null,
      });

      try {
        const user = await firstValueFrom(
          this.http.get<BackendUser>(`${environment.backendUrl}/auth/me`),
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
        // role stays null — guard will still let them through
      } finally {
        settleReady();
      }
    });
  }

  async loginWithGoogle(): Promise<void> {
    const provider = new GoogleAuthProvider();
    await signInWithPopup(firebaseAuth, provider);
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
  }

  async registerWithPhone(fullName: string, phone: string, password: string): Promise<void> {
    const body: RegisterPhoneRequest = { fullName, phone, password };
    const { customToken } = await firstValueFrom(
      this.http.post<PhoneAuthResponse>(`${environment.backendUrl}/auth/phone/register`, body),
    );
    await signInWithCustomToken(firebaseAuth, customToken);
  }

  async loginWithPhone(phone: string, password: string): Promise<void> {
    const body: LoginPhoneRequest = { phone, password };
    const { customToken } = await firstValueFrom(
      this.http.post<PhoneAuthResponse>(`${environment.backendUrl}/auth/phone/login`, body),
    );
    await signInWithCustomToken(firebaseAuth, customToken);
  }

  async logout(): Promise<void> {
    await signOut(firebaseAuth);
  }
}
