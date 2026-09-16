export type UserRole = 'odontologist' | 'patient';

export interface AuthenticatedUser {
  uid: string;
  /** users.id real del backend (CLI-60) — null hasta que /auth/sync o /auth/me resuelven, distinto de uid (que es el auth_user_id de Supabase). */
  id: string | null;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  role: UserRole | null;
}
