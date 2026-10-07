import {
  BadRequestException,
  Injectable,
  Logger,
  ConflictException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  createClient,
  type AuthError,
  type SupabaseClient,
} from '@supabase/supabase-js';
import {
  PhoneLoginError,
  type PhoneLoginResult,
} from '../domain/value-objects/PhoneLoginError.js';

/**
 * Supabase no admite teléfonos repetidos. Al crear un usuario lo dice con un
 * 422 `phone_exists`, pero al actualizar uno existente (updateUserById)
 * responde un 500 genérico "Error updating user", sin código — verificado
 * contra el proyecto real (CLI-143). Las dos formas se tratan como "en uso".
 */
function isPhoneInUse(error: AuthError): boolean {
  return (
    error.code === 'phone_exists' ||
    (error.status === 500 && error.message === 'Error updating user')
  );
}

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

  /**
   * Nunca lanza: quien llama decide qué hacer con un teléfono que no quedó
   * habilitado (rechazar el cambio o dejarlo marcado en la cuenta).
   */
  async setConfirmedPhone(
    authUserId: string,
    phoneE164: string,
  ): Promise<PhoneLoginResult> {
    if (!this.client) {
      this.logger.warn(
        'SUPABASE_SERVICE_ROLE_KEY no configurada — no se pudo confirmar el teléfono en Supabase Auth',
      );
      return { ok: true };
    }
    const { error } = await this.client.auth.admin.updateUserById(authUserId, {
      phone: phoneE164,
      phone_confirm: true,
    });
    if (!error) {
      return { ok: true };
    }
    const reason = isPhoneInUse(error)
      ? PhoneLoginError.PHONE_IN_USE
      : PhoneLoginError.UNKNOWN;
    this.logger.error(
      `No se pudo confirmar el teléfono en Supabase Auth (uid=${authUserId}, motivo=${reason})`,
      error,
    );
    return { ok: false, reason };
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

  /**
   * Cuenta nueva por correo + contraseña, sin confirmar (CLI-242). Usa
   * generateLink en vez de signUp para que Supabase NO mande su correo (su
   * SMTP no estaba funcionando, verificado en vivo) y para obtener el token
   * del link de confirmación, que manda el backend por Resend. Si el correo
   * ya existe sin confirmar, Supabase devuelve esa misma cuenta con un token
   * nuevo; si ya está confirmado, 409.
   */
  async createEmailUser(email: string, password: string): Promise<EmailSignup> {
    const client = this.requireClient(
      'El registro por correo no está configurado todavía',
    );
    const { data, error } = await client.auth.admin.generateLink({
      type: 'signup',
      email,
      password,
    });
    if (error) {
      if (error.code === 'email_exists') {
        throw new ConflictException(
          'Ese correo ya tiene una cuenta. Inicia sesión o recupera tu contraseña.',
        );
      }
      this.logger.error(
        'No se pudo crear el usuario por correo en Supabase Auth',
        error,
      );
      throw new ServiceUnavailableException('No se pudo crear la cuenta');
    }
    return {
      authUserId: data.user.id,
      hashedToken: data.properties.hashed_token,
    };
  }

  /**
   * Un token nuevo para confirmar el correo de una cuenta que todavía no lo
   * confirmó (reenvío, CLI-242). null si la cuenta no existe, no tiene correo
   * o ya está confirmada: nunca crea una cuenta.
   */
  async createEmailConfirmation(
    authUserId: string,
  ): Promise<{ email: string; hashedToken: string } | null> {
    const client = this.requireClient('El reenvío no está configurado todavía');
    const { data: found, error: findError } =
      await client.auth.admin.getUserById(authUserId);
    const email = found?.user?.email;
    if (findError || !email || found.user.email_confirmed_at) {
      return null;
    }
    // GoTrue acepta un link de signup sin contraseña para una cuenta que ya
    // existe sin confirmar (verificado contra el proyecto real); los tipos
    // del SDK la piden igual.
    const { data, error } = await client.auth.admin.generateLink({
      type: 'signup',
      email,
    } as Parameters<typeof client.auth.admin.generateLink>[0]);
    if (error) {
      this.logger.error(
        `No se pudo generar el reenvío de confirmación (uid=${authUserId})`,
        error,
      );
      throw new ServiceUnavailableException('No se pudo reenviar el correo');
    }
    return { email, hashedToken: data.properties.hashed_token };
  }

  /**
   * Token para el link de "olvidé mi contraseña" (CLI-243). null si no hay
   * una cuenta con ese correo (por ejemplo, una creada solo con teléfono):
   * quien llama responde igual, sin revelar si existe.
   */
  async createRecoveryLink(email: string): Promise<string | null> {
    const client = this.requireClient(
      'La recuperación de contraseña no está configurada todavía',
    );
    const { data, error } = await client.auth.admin.generateLink({
      type: 'recovery',
      email,
    });
    if (error) {
      if (error.code === 'user_not_found' || error.status === 404) {
        return null;
      }
      this.logger.error('No se pudo generar el link de recuperación', error);
      throw new ServiceUnavailableException(
        'No se pudo generar el link de recuperación',
      );
    }
    return data.properties.hashed_token;
  }

  /**
   * Contraseña nueva elegida con el link de WhatsApp (CLI-244). Sirve igual
   * para cuentas de teléfono y de correo: va por id, no por credencial.
   */
  async setPassword(authUserId: string, password: string): Promise<void> {
    const client = this.requireClient(
      'El cambio de contraseña no está configurado todavía',
    );
    const { error } = await client.auth.admin.updateUserById(authUserId, {
      password,
    });
    if (!error) return;
    if (error.code === 'weak_password') {
      throw new BadRequestException(
        'Esa contraseña es muy fácil de adivinar. Elige otra.',
      );
    }
    this.logger.error(
      `No se pudo cambiar la contraseña (uid=${authUserId})`,
      error,
    );
    throw new ServiceUnavailableException('No se pudo cambiar la contraseña');
  }

  /** Deshace una cuenta recién creada si no se pudo vincular (CLI-242). Nunca lanza. */
  async deleteUser(authUserId: string): Promise<void> {
    if (!this.client) return;
    const { error } = await this.client.auth.admin.deleteUser(authUserId);
    if (error) {
      this.logger.error(
        `No se pudo borrar la cuenta recién creada (uid=${authUserId})`,
        error,
      );
    }
  }

  private requireClient(message: string): SupabaseClient {
    if (!this.client) {
      throw new ServiceUnavailableException(message);
    }
    return this.client;
  }
}

export interface EmailSignup {
  authUserId: string;
  /** Token del link de confirmación (verifyOtp con token_hash). */
  hashedToken: string;
}
