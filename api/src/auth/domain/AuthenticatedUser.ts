export interface AuthenticatedUser {
  uid: string;
  email: string | null;
  phone: string | null;
  displayName: string | null;
  photoUrl: string | null;
}
