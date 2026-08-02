export type UserRole = 'odontologist' | 'patient';

export interface UserModel {
  id: string;
  firebaseUid: string;
  email: string;
  role: UserRole;
  displayName: string | null;
  phone: string | null;
  photoUrl: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}
