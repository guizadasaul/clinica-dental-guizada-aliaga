import { User } from './User';

export interface UpsertUserData {
  firebaseUid: string;
  email: string | null;
  displayName: string | null;
  photoUrl: string | null;
  phone?: string | null;
}

export interface CreatePhoneUserData {
  firebaseUid: string;
  displayName: string;
  phone: string;
  passwordHash: string;
}

export interface UserRepository {
  findByFirebaseUid(firebaseUid: string): Promise<User | null>;
  findByPhone(phone: string): Promise<User | null>;
  upsertByFirebaseUid(data: UpsertUserData): Promise<User>;
  createPhoneUser(data: CreatePhoneUserData): Promise<User>;
}

export const UserRepository = Symbol('UserRepository');
