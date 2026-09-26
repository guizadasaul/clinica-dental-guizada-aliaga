import { User } from './User';
import { UserRole } from './value-objects/UserRole';

export interface UpsertUserData {
  authUserId: string;
  email: string | null;
  phone?: string;
  displayName: string | null;
  photoUrl: string | null;
}

export interface CreatePlaceholderUserData {
  displayName: string | null;
  phone: string | null;
  email?: string | null;
  role?: UserRole;
}

export interface LinkAuthIdentityData {
  authUserId: string;
  email: string | null;
  phone?: string;
  displayName: string | null;
  photoUrl: string | null;
}

export interface UpdateContactInfoData {
  email?: string;
  phone?: string;
  displayName?: string;
}

export interface UserRepository {
  findByAuthUserId(authUserId: string): Promise<User | null>;
  /** Por users.id (ej. el dueño de un número de WhatsApp vinculado, CLI-100). */
  findById(id: string): Promise<User | null>;
  upsertByAuthUserId(data: UpsertUserData): Promise<User>;

  /** Crea un User "placeholder" sin identidad de Supabase (authUserId: null). */
  createPlaceholder(data: CreatePlaceholderUserData): Promise<User>;

  /**
   * Vincula una identidad de Supabase a un User existente sin cuenta reclamada.
   * UPDATE condicional (WHERE id = userId AND auth_user_id IS NULL) — devuelve
   * null si la fila ya tenía auth_user_id seteado, sin pisarlo.
   */
  linkAuthIdentity(
    userId: string,
    data: LinkAuthIdentityData,
  ): Promise<User | null>;

  /** null si userId no existe. Lanza ConflictException si el email ya está en uso. */
  updateContactInfo(
    userId: string,
    data: UpdateContactInfoData,
  ): Promise<User | null>;
}

export const UserRepository = Symbol('UserRepository');
