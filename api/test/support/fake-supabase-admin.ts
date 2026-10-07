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

  reset(): void {
    this.phoneUsers.clear();
    this.confirmedPhones.clear();
  }
}
