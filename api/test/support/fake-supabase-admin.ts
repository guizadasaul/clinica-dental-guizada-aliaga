import { randomUUID } from 'node:crypto';
import { ConflictException } from '@nestjs/common';
import type { PhoneLoginResult } from '../../src/auth/domain/value-objects/PhoneLoginError';

/**
 * Reemplaza a SupabaseAdminService en los e2e (CLI-241): guarda las cuentas
 * creadas en memoria en vez de llamar al Admin API de Supabase, con los
 * mismos errores que el real (409 si el teléfono ya existe).
 */
export class FakeSupabaseAdmin {
  /** authUserId → teléfono E.164, de las cuentas creadas por teléfono. */
  readonly phoneUsers = new Map<string, string>();
  /** authUserId → teléfono confirmado como login (setConfirmedPhone). */
  readonly confirmedPhones = new Map<string, string>();
  /** authUserId → cuenta creada por correo (CLI-242). */
  readonly emailUsers = new Map<
    string,
    { email: string; confirmed: boolean }
  >();
  readonly deletedUsers: string[] = [];
  /** authUserId → última contraseña puesta con setPassword (CLI-244). */
  readonly passwords = new Map<string, string>();
  /** Si está, setPassword falla con este error (una sola vez). */
  failNextSetPassword: Error | null = null;
  private tokenSequence = 0;

  createPhoneUser(phoneE164: string): Promise<{ authUserId: string }> {
    if ([...this.phoneUsers.values()].includes(phoneE164)) {
      return Promise.reject(
        new ConflictException('Ese teléfono ya está registrado'),
      );
    }
    const authUserId = randomUUID();
    this.phoneUsers.set(authUserId, phoneE164);
    return Promise.resolve({ authUserId });
  }

  setConfirmedPhone(
    authUserId: string,
    phoneE164: string,
  ): Promise<PhoneLoginResult> {
    this.confirmedPhones.set(authUserId, phoneE164);
    return Promise.resolve({ ok: true });
  }

  /** Igual que generateLink signup: misma cuenta si ya existe sin confirmar, 409 si está confirmada. */
  createEmailUser(
    email: string,
  ): Promise<{ authUserId: string; hashedToken: string }> {
    const existing = [...this.emailUsers.entries()].find(
      ([, user]) => user.email === email,
    );
    if (existing?.[1].confirmed) {
      return Promise.reject(
        new ConflictException(
          'Ese correo ya tiene una cuenta. Inicia sesión o recupera tu contraseña.',
        ),
      );
    }
    const authUserId = existing?.[0] ?? randomUUID();
    this.emailUsers.set(authUserId, { email, confirmed: false });
    return Promise.resolve({ authUserId, hashedToken: this.nextToken() });
  }

  createEmailConfirmation(
    authUserId: string,
  ): Promise<{ email: string; hashedToken: string } | null> {
    const user = this.emailUsers.get(authUserId);
    return Promise.resolve(
      user && !user.confirmed
        ? { email: user.email, hashedToken: this.nextToken() }
        : null,
    );
  }

  /** Como generateLink recovery: null si no hay una cuenta con ese correo (CLI-243). */
  createRecoveryLink(email: string): Promise<string | null> {
    const exists = [...this.emailUsers.values()].some((u) => u.email === email);
    return Promise.resolve(exists ? this.nextToken() : null);
  }

  setPassword(authUserId: string, password: string): Promise<void> {
    const failure = this.failNextSetPassword;
    if (failure) {
      this.failNextSetPassword = null;
      return Promise.reject(failure);
    }
    this.passwords.set(authUserId, password);
    return Promise.resolve();
  }

  deleteUser(authUserId: string): Promise<void> {
    this.deletedUsers.push(authUserId);
    this.emailUsers.delete(authUserId);
    return Promise.resolve();
  }

  /** Lo que haría verifyOtp al abrir el link del correo. */
  confirmEmail(authUserId: string): void {
    const user = this.emailUsers.get(authUserId);
    if (user) user.confirmed = true;
  }

  private nextToken(): string {
    this.tokenSequence += 1;
    return `hash-${this.tokenSequence}`;
  }

  reset(): void {
    this.phoneUsers.clear();
    this.confirmedPhones.clear();
    this.emailUsers.clear();
    this.deletedUsers.length = 0;
    this.passwords.clear();
    this.failNextSetPassword = null;
  }
}
