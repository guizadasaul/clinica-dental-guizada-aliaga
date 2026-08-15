import { Injectable, Logger } from '@nestjs/common';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Cliente admin de Supabase (service_role key) — solo se usa para confirmar
 * un teléfono como credencial de login sin pasar por el flujo de SMS/OTP de
 * Supabase. El dato ya lo verificó el doctor al cargarlo en la ficha del
 * paciente, así que se confía en él igual que hoy se confía en el email.
 */
@Injectable()
export class SupabaseAdminService {
  private readonly logger = new Logger(SupabaseAdminService.name);
  private readonly client: SupabaseClient | null;

  constructor() {
    const supabaseUrl = process.env['SUPABASE_URL'];
    const serviceRoleKey = process.env['SUPABASE_SERVICE_ROLE_KEY'];
    this.client =
      supabaseUrl && serviceRoleKey
        ? createClient(supabaseUrl, serviceRoleKey, {
            auth: { autoRefreshToken: false, persistSession: false },
          })
        : null;
  }

  async setConfirmedPhone(
    authUserId: string,
    phoneE164: string,
  ): Promise<void> {
    if (!this.client) {
      this.logger.warn(
        'SUPABASE_SERVICE_ROLE_KEY no configurada — no se pudo confirmar el teléfono en Supabase Auth',
      );
      return;
    }
    const { error } = await this.client.auth.admin.updateUserById(authUserId, {
      phone: phoneE164,
      phone_confirm: true,
    });
    if (error) {
      this.logger.error(
        `No se pudo confirmar el teléfono en Supabase Auth (uid=${authUserId})`,
        error,
      );
    }
  }
}
