/**
 * Por qué un teléfono no quedó habilitado como login en Supabase Auth
 * (CLI-143). Se guarda en users.phone_login_error para que el doctor o el
 * admin lo vea en la ficha, no solo en los logs.
 */
export const PhoneLoginError = {
  /** El número ya pertenece a otra cuenta de Supabase Auth (no admite repetidos). */
  PHONE_IN_USE: 'phone_in_use',
  /** Cualquier otro error de la Admin API. */
  UNKNOWN: 'unknown',
} as const;
export type PhoneLoginError =
  (typeof PhoneLoginError)[keyof typeof PhoneLoginError];

export type PhoneLoginResult =
  { ok: true } | { ok: false; reason: PhoneLoginError };
