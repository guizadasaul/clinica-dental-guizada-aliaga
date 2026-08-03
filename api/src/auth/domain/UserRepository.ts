import { User } from './User';

export interface UpsertUserData {
  authUserId: string;
  email: string | null;
  displayName: string | null;
  photoUrl: string | null;
}

export interface UserRepository {
  findByAuthUserId(authUserId: string): Promise<User | null>;
  upsertByAuthUserId(data: UpsertUserData): Promise<User>;
}

export const UserRepository = Symbol('UserRepository');
