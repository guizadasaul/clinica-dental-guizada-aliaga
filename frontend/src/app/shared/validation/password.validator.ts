// Función pura, sin Angular. Único punto de verdad para la regla de contraseña
// del frontend — antes duplicada a mano en reset-password.ts e
// invitation-landing.ts.

export const PASSWORD_MIN_LENGTH = 8;
// Límite real de bcrypt (Supabase lo aplica server-side); login.html ya usa
// maxlength="72" en su input, esto lo alinea en el resto de los formularios.
export const PASSWORD_MAX_LENGTH = 72;

export function validatePassword(value: string): string | null {
  if (value.length < PASSWORD_MIN_LENGTH) {
    return `La contraseña debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres.`;
  }
  if (value.length > PASSWORD_MAX_LENGTH) {
    return `La contraseña no puede superar los ${PASSWORD_MAX_LENGTH} caracteres.`;
  }
  return null;
}

export function passwordsMatch(password: string, confirm: string): string | null {
  return password === confirm ? null : 'Las contraseñas no coinciden.';
}
