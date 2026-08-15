import {
  Injectable,
  Logger,
  ConflictException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Cliente admin de Supabase (service_role key) — se usa para confirmar un
 * teléfono como credencial de login sin pasar por el flujo de SMS/OTP de
 * Supabase (el dato ya lo verificó el doctor al cargarlo en la ficha del
 * paciente, así que se confía en él igual que hoy se confía en el email), y
 * para crear cuentas nuevas por teléfono+contraseña (CLI-27) — la única
 * forma de crear un usuario de Supabase con un teléfono ya confirmado sin
 * disparar un SMS real es vía esta Admin API.
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

  async createPhoneUser(
    phoneE164: string,
    password: string,
  ): Promise<{ authUserId: string }> {
    if (!this.client) {
      throw new ServiceUnavailableException(
        'El registro por teléfono no está configurado todavía',
      );
    }
    const { data, error } = await this.client.auth.admin.createUser({
      phone: phoneE164,
      password,
      phone_confirm: true,
    });
    if (error) {
      if (error.code === 'phone_exists') {
        throw new ConflictException('Ese teléfono ya está registrado');
      }
      this.logger.error(
        `No se pudo crear el usuario por teléfono en Supabase Auth (phone=${phoneE164})`,
        error,
      );
      throw new ServiceUnavailableException('No se pudo crear la cuenta');
    }
    return { authUserId: data.user.id };
  }
}
