export interface AuthenticatedUser {
  uid: string;
  email: string;
  displayName: string | null;
  photoUrl: string | null;
}
