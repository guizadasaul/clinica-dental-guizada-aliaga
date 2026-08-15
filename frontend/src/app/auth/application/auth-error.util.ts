import type { AuthError } from '@supabase/supabase-js';

const MESSAGES_BY_CODE: Record<string, string> = {
  invalid_credentials: 'Correo/teléfono o contraseña incorrectos.',
  user_already_exists: 'Ya existe una cuenta con este correo.',
  email_exists: 'Ya existe una cuenta con este correo.',
  weak_password: 'La contraseña debe tener al menos 6 caracteres.',
  email_not_confirmed: 'Confirmá tu correo antes de iniciar sesión. Revisá tu bandeja de entrada.',
  same_password: 'La nueva contraseña debe ser diferente a la anterior.',
  over_email_send_rate_limit: 'Demasiados intentos. Esperá unos minutos antes de volver a intentar.',
};

const MESSAGE_FALLBACKS: Array<[needle: string, message: string]> = [
  ['Invalid login credentials', 'Correo/teléfono o contraseña incorrectos.'],
  ['User already registered', 'Ya existe una cuenta con este correo.'],
  ['Password should be at least', 'La contraseña debe tener al menos 6 caracteres.'],
];

export function mapAuthError(error: unknown, fallback: string): string {
  const authError = error as Partial<AuthError> | null;
  const code = authError?.code;
  if (code && MESSAGES_BY_CODE[code]) {
    return MESSAGES_BY_CODE[code];
  }

  const message = authError?.message ?? '';
  const match = MESSAGE_FALLBACKS.find(([needle]) => message.includes(needle));
  return match ? match[1] : fallback;
}
