import type { UserRole } from './authenticated-user.model';

export interface BackendUser {
  id: string;
  firebaseUid: string;
  email: string | null;
  role: UserRole;
  displayName: string | null;
  phone: string | null;
  photoUrl: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}
