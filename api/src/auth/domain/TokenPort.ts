export interface TokenPort {
  createFirebaseUser(displayName: string): Promise<string>;
  createCustomToken(uid: string): Promise<string>;
}

export const TokenPort = Symbol('TokenPort');
